cmake_minimum_required(VERSION 3.4.1)

set(OPUS_DIR ${CMAKE_CURRENT_SOURCE_DIR}/opus)

add_definitions(-DOPUS_BUILD -DVAR_ARRAYS -DFIXED_POINT -DHAVE_LRINT -DHAVE_LRINTF)

include_directories(
    ${OPUS_DIR}/include
    ${OPUS_DIR}/celt
    ${OPUS_DIR}/silk
    ${OPUS_DIR}/silk/fixed
)

file(GLOB SILK_SOURCES ${OPUS_DIR}/silk/*.c)
file(GLOB SILK_FIXED_SOURCES ${OPUS_DIR}/silk/fixed/*.c)
file(GLOB CELT_SOURCES ${OPUS_DIR}/celt/*.c)
file(GLOB OPUS_SOURCES ${OPUS_DIR}/src/*.c)

# Remove unused sources (float point stuff if we are using fixed)
# Actually, silk/float is separate.
# Remove programs
list(FILTER OPUS_SOURCES EXCLUDE REGEX ".*_demo\\.c$")
list(FILTER OPUS_SOURCES EXCLUDE REGEX ".*_compare\\.c$")
list(FILTER OPUS_SOURCES EXCLUDE REGEX ".*_custom\\.c$") # Maybe needed?

add_library(opus_jni SHARED
    opus_jni.c
    ${SILK_SOURCES}
    ${SILK_FIXED_SOURCES}
    ${CELT_SOURCES}
    ${OPUS_SOURCES}
)

target_link_libraries(opus_jni log)
