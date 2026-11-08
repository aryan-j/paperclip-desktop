#include <node_api.h>

#include <cstring>
#include <memory>
#include <string>
#include <unordered_map>

#include "PaperclipToolbar.h"

struct CallbackContext {
  napi_threadsafe_function function;
};

static std::unordered_map<void *, CallbackContext *> callbacksByWindow;

static void CallJavaScript(napi_env env, napi_value callback, void *, void *data) {
  std::unique_ptr<std::string> action(static_cast<std::string *>(data));
  if (env == nullptr || callback == nullptr || action == nullptr) {
    return;
  }

  napi_value global;
  napi_value argument;
  napi_value result;
  if (napi_get_global(env, &global) != napi_ok ||
      napi_create_string_utf8(env, action->c_str(), action->size(), &argument) != napi_ok) {
    return;
  }

  napi_call_function(env, global, callback, 1, &argument, &result);
}

static void DispatchToolbarAction(void *context, const char *action) {
  auto *callbackContext = static_cast<CallbackContext *>(context);
  if (callbackContext == nullptr || callbackContext->function == nullptr) {
    return;
  }

  auto *payload = new std::string(action == nullptr ? "" : action);
  if (napi_call_threadsafe_function(
          callbackContext->function,
          payload,
          napi_tsfn_nonblocking) != napi_ok) {
    delete payload;
  }
}

static bool ReadNativeViewHandle(napi_env env, napi_value value, void **nativeView) {
  bool isBuffer = false;
  if (napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer) {
    return false;
  }

  void *bufferData = nullptr;
  size_t bufferLength = 0;
  if (napi_get_buffer_info(env, value, &bufferData, &bufferLength) != napi_ok ||
      bufferData == nullptr || bufferLength < sizeof(*nativeView)) {
    return false;
  }

  std::memcpy(nativeView, bufferData, sizeof(*nativeView));
  return *nativeView != nullptr;
}

static napi_value ConfigureWindow(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 2) {
    napi_throw_type_error(env, nullptr, "configureWindow expects a native handle and callback");
    return nullptr;
  }

  void *nativeView = nullptr;
  if (!ReadNativeViewHandle(env, argv[0], &nativeView)) {
    napi_throw_type_error(env, nullptr, "configureWindow expected an Electron native view handle");
    return nullptr;
  }

  napi_valuetype callbackType;
  if (napi_typeof(env, argv[1], &callbackType) != napi_ok || callbackType != napi_function) {
    napi_throw_type_error(env, nullptr, "configureWindow expected an action callback");
    return nullptr;
  }

  if (callbacksByWindow.find(nativeView) != callbacksByWindow.end()) {
    napi_value result;
    napi_get_boolean(env, true, &result);
    return result;
  }

  auto *callbackContext = new CallbackContext{nullptr};
  napi_value resourceName;
  napi_create_string_utf8(env, "paperclip-native-toolbar", NAPI_AUTO_LENGTH, &resourceName);
  if (napi_create_threadsafe_function(
          env,
          argv[1],
          nullptr,
          resourceName,
          0,
          1,
          nullptr,
          nullptr,
          callbackContext,
          CallJavaScript,
          &callbackContext->function) != napi_ok) {
    delete callbackContext;
    napi_throw_error(env, nullptr, "Could not create the native toolbar callback");
    return nullptr;
  }

  const int32_t configured = paperclip_configure_native_toolbar(
      nativeView,
      callbackContext,
      DispatchToolbarAction);
  if (configured == 0) {
    napi_release_threadsafe_function(callbackContext->function, napi_tsfn_abort);
    delete callbackContext;
    napi_value result;
    napi_get_boolean(env, false, &result);
    return result;
  }

  callbacksByWindow[nativeView] = callbackContext;
  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

static napi_value UpdateWindowLayout(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 3) {
    napi_throw_type_error(env, nullptr, "updateWindowLayout expects a native handle, x, and top");
    return nullptr;
  }

  void *nativeView = nullptr;
  if (!ReadNativeViewHandle(env, argv[0], &nativeView)) {
    napi_throw_type_error(env, nullptr, "updateWindowLayout expected an Electron native view handle");
    return nullptr;
  }

  double x = 0;
  double top = 0;
  if (napi_get_value_double(env, argv[1], &x) != napi_ok ||
      napi_get_value_double(env, argv[2], &top) != napi_ok ||
      x < 0 || top < 0) {
    napi_throw_type_error(env, nullptr, "updateWindowLayout expects non-negative coordinates");
    return nullptr;
  }

  const int32_t updated = paperclip_update_native_toolbar(nativeView, x, top);
  napi_value result;
  napi_get_boolean(env, updated != 0, &result);
  return result;
}

static napi_value DisposeWindow(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 1) {
    napi_throw_type_error(env, nullptr, "disposeWindow expects a native handle");
    return nullptr;
  }

  void *nativeView = nullptr;
  if (!ReadNativeViewHandle(env, argv[0], &nativeView)) {
    napi_throw_type_error(env, nullptr, "disposeWindow expected an Electron native view handle");
    return nullptr;
  }

  auto found = callbacksByWindow.find(nativeView);
  if (found != callbacksByWindow.end()) {
    napi_release_threadsafe_function(found->second->function, napi_tsfn_abort);
    delete found->second;
    callbacksByWindow.erase(found);
  }

  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

static napi_value Initialize(napi_env env, napi_value exports) {
  napi_value configureWindow;
  napi_value updateWindowLayout;
  napi_value disposeWindow;
  napi_create_function(env, "configureWindow", NAPI_AUTO_LENGTH, ConfigureWindow, nullptr, &configureWindow);
  napi_create_function(env, "updateWindowLayout", NAPI_AUTO_LENGTH, UpdateWindowLayout, nullptr, &updateWindowLayout);
  napi_create_function(env, "disposeWindow", NAPI_AUTO_LENGTH, DisposeWindow, nullptr, &disposeWindow);
  napi_set_named_property(env, exports, "configureWindow", configureWindow);
  napi_set_named_property(env, exports, "updateWindowLayout", updateWindowLayout);
  napi_set_named_property(env, exports, "disposeWindow", disposeWindow);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
