{
  "targets": [
    {
      "target_name": "paperclip_native_toolbar",
      "sources": ["src/addon.mm"],
      "include_dirs": ["include"],
      "defines": ["NAPI_VERSION=8"],
      "libraries": [
        "<(module_root_dir)/swift-build/<(target_arch)/libPaperclipNativeToolbar.dylib"
      ],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "MACOSX_DEPLOYMENT_TARGET": "11.0"
      }
    }
  ]
}
