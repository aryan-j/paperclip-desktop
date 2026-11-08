#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*PaperclipToolbarActionCallback)(void *context, const char *action);

int32_t paperclip_configure_native_toolbar(
    void *nativeViewHandle,
    void *context,
    PaperclipToolbarActionCallback callback);

int32_t paperclip_update_native_toolbar(void *nativeViewHandle, double x, double top);

#ifdef __cplusplus
}
#endif
