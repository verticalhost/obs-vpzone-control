cmake_minimum_required(VERSION 3.28...3.30)

include("${CMAKE_CURRENT_SOURCE_DIR}/cmake/common/bootstrap.cmake" NO_POLICY_SCOPE)
project(${_name} VERSION ${_version})

include(compilerconfig)
include(defaults)
include(helpers)

add_library(${CMAKE_PROJECT_NAME} MODULE)

find_package(libobs REQUIRED)
find_package(obs-frontend-api REQUIRED)
find_package(Qt6 REQUIRED COMPONENTS Core Widgets)

target_link_libraries(
  ${CMAKE_PROJECT_NAME}
  PRIVATE OBS::libobs OBS::obs-frontend-api Qt6::Core Qt6::Widgets
)

target_sources(
  ${CMAKE_PROJECT_NAME}
  PRIVATE src/plugin-main.cpp src/browser-panel.hpp
)

target_compile_features(${CMAKE_PROJECT_NAME} PRIVATE cxx_std_20)
set_target_properties(${CMAKE_PROJECT_NAME} PROPERTIES AUTOMOC ON)

if(WIN32)
  set(VPZONE_SERVICE "${CMAKE_CURRENT_BINARY_DIR}/VPZONE-Control.exe")
  file(
    DOWNLOAD
    "https://github.com/verticalhost/obs-vpzone-control/releases/download/service-v2.0.0-beta1/VPZONE-Control.exe"
    "${VPZONE_SERVICE}"
    EXPECTED_HASH SHA256=ea1f91f55ff03bdee13cbf9b9b3529627ba76a0800d1cc52af795effdb0d2049
    TLS_VERIFY ON
  )
  target_add_resource(${CMAKE_PROJECT_NAME} "${VPZONE_SERVICE}")
endif()

set_target_properties_plugin(${CMAKE_PROJECT_NAME} PROPERTIES OUTPUT_NAME ${_name})
