//
//  AudioEngine.swift
//  OpenIntercomMobile
//
//  Created by OpenIntercom on 11/29/25.
//

import Foundation
import AVFoundation
import React

@objc(AudioEngine)
class AudioEngine: RCTEventEmitter {
  
  private var engine: AVAudioEngine!
  private var playerNode: AVAudioPlayerNode!
  private var inputConverter: AVAudioConverter!
  private var outputConverter: AVAudioConverter!
  private var targetFormat: AVAudioFormat! // 48kHz, 1ch, Int16 (Interleaved)
  
  private var isRunning = false
  
  override init() {
    super.init()
    setupEngine()
  }
  
  // Required for RCTEventEmitter
  override func supportedEvents() -> [String]! {
    return ["onAudioData"]
  }
  
  // Required to prevent warning
  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  private func setupEngine() {
    engine = AVAudioEngine()
    playerNode = AVAudioPlayerNode()
    engine.attach(playerNode)
    
    // Target format: 48kHz, 1 channel, 16-bit Integer (Common for VoIP)
    // Note: AVAudioFormat commonFormat .pcmFormatInt16 is not always supported for *processing* nodes directly,
    // but we use it for the buffer format we exchange with JS.
    targetFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 48000, channels: 1, interleaved: true)
    
    let inputNode = engine.inputNode
    let inputFormat = inputNode.inputFormat(forBus: 0)
    
    // Connect player to main mixer
    engine.connect(playerNode, to: engine.mainMixerNode, format: targetFormat)
    
    // Setup Input Tap (Microphone)
    inputNode.installTap(onBus: 0, bufferSize: 2048, format: inputFormat) { [weak self] (buffer, time) in
      guard let self = self, self.isRunning else { return }
      self.processInputBuffer(buffer)
    }
    
    // Configure Audio Session for VoIP
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
      try session.setActive(true)
    } catch {
      print("Failed to set audio session category: \(error)")
    }
  }
  
  private func processInputBuffer(_ buffer: AVAudioPCMBuffer) {
    // Convert from Hardware Format (usually Float32) to Target Format (Int16 48kHz)
    guard let targetFormat = self.targetFormat else { return }
    
    // If formats match, just send
    if buffer.format == targetFormat {
      self.sendBuffer(buffer)
      return
    }
    
    // Otherwise convert
    if inputConverter == nil || inputConverter.inputFormat != buffer.format {
      inputConverter = AVAudioConverter(from: buffer.format, to: targetFormat)
    }
    
    let ratio = targetFormat.sampleRate / buffer.format.sampleRate
    let capacity = UInt32(Double(buffer.frameCapacity) * ratio)
    guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else { return }
    
    var error: NSError? = nil
    let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
      outStatus.pointee = .haveData
      return buffer
    }
    
    inputConverter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)
    
    if error == nil {
      self.sendBuffer(outputBuffer)
    }
  }
  
  private func sendBuffer(_ buffer: AVAudioPCMBuffer) {
    guard let channelData = buffer.int16ChannelData else { return }
    
    let channelDataPointer = channelData.pointee
    let frameLength = Int(buffer.frameLength)
    let data = Data(bytes: channelDataPointer, count: frameLength * 2) // 2 bytes per sample
    
    let base64String = data.base64EncodedString()
    sendEvent(withName: "onAudioData", body: base64String)
  }
  
  @objc
  func start() {
    if !engine.isRunning {
      do {
        try engine.start()
        playerNode.play()
        isRunning = true
        print("AudioEngine started")
      } catch {
        print("Could not start audio engine: \(error)")
      }
    }
  }
  
  @objc
  func stop() {
    if engine.isRunning {
      engine.stop()
      playerNode.stop()
      isRunning = false
      print("AudioEngine stopped")
    }
  }
  
  @objc(queueAudio:)
  func queueAudio(_ base64String: String) {
    guard let data = Data(base64Encoded: base64String),
          let buffer = dataToPCMBuffer(data: data) else {
      return
    }
    
    playerNode.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
    
    if !playerNode.isPlaying && engine.isRunning {
        playerNode.play()
    }
  }
  
  private func dataToPCMBuffer(data: Data) -> AVAudioPCMBuffer? {
    guard let targetFormat = self.targetFormat else { return nil }
    
    let frameCount = UInt32(data.count) / 2 // 2 bytes per sample
    guard let buffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCount) else { return nil }
    
    buffer.frameLength = frameCount
    let audioBuffer = buffer.int16ChannelData?.pointee
    
    data.withUnsafeBytes { (rawBufferPointer: UnsafeRawBufferPointer) in
      if let baseAddress = rawBufferPointer.baseAddress, let audioBuffer = audioBuffer {
        audioBuffer.copyMemory(from: baseAddress.assumingMemoryBound(to: Int16.self), byteCount: data.count)
      }
    }
    
    return buffer
  }
}
