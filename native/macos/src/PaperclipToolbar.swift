import AppKit
import Foundation
import ObjectiveC

public typealias PaperclipToolbarActionCallback = @convention(c) (
    UnsafeMutableRawPointer?,
    UnsafePointer<CChar>?
) -> Void

private var toolbarDelegateAssociationKey: UInt8 = 0

@MainActor
private final class PaperclipSidebarController: NSObject {
    private let context: UnsafeMutableRawPointer?
    private let callback: PaperclipToolbarActionCallback
    private weak var nativeView: NSView?
    private let button: NSButton

    init?(
        nativeView: NSView,
        context: UnsafeMutableRawPointer?,
        callback: PaperclipToolbarActionCallback
    ) {
        guard let image = NSImage(
            systemSymbolName: "sidebar.left",
            accessibilityDescription: "Toggle sidebar"
        ) else {
            return nil
        }

        self.nativeView = nativeView
        self.context = context
        self.callback = callback
        self.button = NSButton(image: image, target: nil, action: nil)
        super.init()

        button.image?.isTemplate = true
        button.bezelStyle = .regularSquare
        button.isBordered = false
        button.setAccessibilityLabel("Toggle sidebar")
        button.toolTip = "Show or hide the Paperclip sidebar"
        button.target = self
        button.action = #selector(toggleSidebar(_:))
        button.frame = NSRect(x: 0, y: 0, width: 28, height: 28)
        button.autoresizingMask = [.minYMargin]
        nativeView.addSubview(button, positioned: .above, relativeTo: nil)
    }

    @objc fileprivate func toggleSidebar(_ sender: Any?) {
        "toggle-sidebar".withCString { action in
            callback(context, action)
        }
    }

    func updatePosition(x: CGFloat, top: CGFloat) {
        guard let nativeView else { return }

        let size = button.frame.size
        button.setFrameOrigin(
            NSPoint(
                x: x,
                y: nativeView.bounds.maxY - top - size.height
            )
        )
    }
}

@_cdecl("paperclip_configure_native_toolbar")
public func paperclipConfigureNativeToolbar(
    _ nativeViewHandle: UnsafeMutableRawPointer?,
    _ context: UnsafeMutableRawPointer?,
    _ callback: PaperclipToolbarActionCallback?
) -> Int32 {
    guard let nativeViewHandle, let callback, Thread.isMainThread else {
        return 0
    }

    return MainActor.assumeIsolated {
        let nativeView = Unmanaged<NSView>.fromOpaque(nativeViewHandle).takeUnretainedValue()
        guard let window = nativeView.window else {
            return 0
        }

        guard let controller = PaperclipSidebarController(
            nativeView: nativeView,
            context: context,
            callback: callback
        ) else {
            return 0
        }

        // Retain the action target for the native window's lifetime.
        objc_setAssociatedObject(
            window,
            &toolbarDelegateAssociationKey,
            controller,
            .OBJC_ASSOCIATION_RETAIN_NONATOMIC
        )

        return 1
    }
}

@_cdecl("paperclip_update_native_toolbar")
public func paperclipUpdateNativeToolbar(
    _ nativeViewHandle: UnsafeMutableRawPointer?,
    _ x: Double,
    _ top: Double
) -> Int32 {
    guard let nativeViewHandle, Thread.isMainThread else {
        return 0
    }

    return MainActor.assumeIsolated {
        let nativeView = Unmanaged<NSView>.fromOpaque(nativeViewHandle).takeUnretainedValue()
        guard let window = nativeView.window,
              let controller = objc_getAssociatedObject(
                  window,
                  &toolbarDelegateAssociationKey
              ) as? PaperclipSidebarController else {
            return 0
        }

        controller.updatePosition(x: CGFloat(x), top: CGFloat(top))
        return 1
    }
}
