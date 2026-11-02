import UIKit
import WebKit
import Capacitor

/// Projector support: when a display is connected (HDMI/USB-C adapter or AirPlay) and the iPad mirrors,
/// iOS hands the app a separate scene for it. That scene shows /output while the iPad keeps the editor,
/// like Keynote. With Stage Manager the display is extended instead and gets no such scene, so the editor
/// can open /output as a second window that the user drags onto the monitor.
/// The web views exchange the same SyncMessages the web version sends over BroadcastChannel
/// (see src/lib/sync.ts); this class relays them.
final class ExternalDisplay {
    static let shared = ExternalDisplay()
    static let outputWindowActivity = "de.reedu.lichtwerk.output"
    static let outputWindowConfiguration = "Output Window"

    weak var plugin: ExternalDisplayPlugin?
    private let outputWebViews = NSHashTable<WKWebView>.weakObjects()

    var isConnected: Bool { outputWebViews.count > 0 }

    func attach(_ webView: WKWebView) {
        outputWebViews.add(webView)
        plugin?.notifyListeners("display", data: ["connected": true])
    }

    func detach(_ webView: WKWebView) {
        outputWebViews.remove(webView)
        plugin?.notifyListeners("display", data: ["connected": isConnected])
    }

    /// Editor -> outputs. `json` is a serialised SyncMessage, which is also a valid JS literal.
    func sendToOutput(_ json: String) {
        for webView in outputWebViews.allObjects {
            webView.evaluateJavaScript("window.__lichtwerkReceive?.(\(json)); 0", completionHandler: nil)
        }
    }

    /// Opens /output in its own window, or brings the existing one to the front.
    func openOutputWindow() {
        let existing = UIApplication.shared.openSessions.first {
            $0.configuration.name == ExternalDisplay.outputWindowConfiguration
        }
        let activity = existing == nil ? NSUserActivity(activityType: ExternalDisplay.outputWindowActivity) : nil
        UIApplication.shared.requestSceneSessionActivation(existing, userActivity: activity, options: nil) { error in
            NSLog("[Lichtwerk] could not open the output window: %@", error.localizedDescription)
        }
    }

    /// Output -> editor.
    func sendToEditor(_ json: String) {
        plugin?.notifyListeners("message", data: ["json": json])
    }
}

/// Scene for the role `windowExternalDisplayNonInteractive` and for the output window (see AppDelegate).
final class OutputSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = .black
        window.rootViewController = OutputViewController()
        window.isHidden = false
        self.window = window
        // the output window on the iPad (Stage Manager); a connected display has no orientation to lock
        if session.role == .windowApplication { windowScene.lockLandscape() }
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        if let webView = window?.rootViewController?.view as? WKWebView {
            ExternalDisplay.shared.detach(webView)
        }
        window = nil
    }

    /// Lets a restored output window come back as an output window, not as a second editor.
    func stateRestorationActivity(for scene: UIScene) -> NSUserActivity? {
        scene.session.role == .windowApplication ? NSUserActivity(activityType: ExternalDisplay.outputWindowActivity) : nil
    }
}

/// A plain web view (no Capacitor bridge) that serves the bundled web app like the main one does.
final class OutputViewController: UIViewController, WKScriptMessageHandler {
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        LandscapeOnly.orientations
    }

    override func loadView() {
        let configuration = InstanceConfiguration(with: InstanceDescriptor(), isDebug: CapacitorBridge.isDevEnvironment)
        let assetHandler = WebViewAssetHandler(router: CapacitorRouter())
        assetHandler.setAssetPath(configuration.appLocation.path)
        assetHandler.setServerUrl(configuration.serverURL)

        let webConfig = WKWebViewConfiguration()
        webConfig.setURLSchemeHandler(assetHandler, forURLScheme: configuration.localURL.scheme ?? InstanceDescriptorDefaults.scheme)
        let content = webConfig.userContentController
        content.addUserScript(WKUserScript(source: "window.__lichtwerkOutput = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.add(WeakMessageHandler(self), name: "lichtwerk")

        let webView = WKWebView(frame: .zero, configuration: webConfig)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view = webView

        // Bundled files: the Capacitor router sends paths without an extension to index.html,
        // so ask for output.html. Live reload: the dev server knows /output.
        let liveReload = configuration.serverURL.scheme != configuration.localURL.scheme
        webView.load(URLRequest(url: configuration.serverURL.appendingPathComponent(liveReload ? "output" : "output.html")))
        ExternalDisplay.shared.attach(webView)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let json = message.body as? String {
            ExternalDisplay.shared.sendToEditor(json)
        }
    }
}

/// WKUserContentController keeps its handlers alive; this avoids a retain cycle with the view controller.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

/// JS side: src/lib/externalDisplay.ts
@objc(ExternalDisplayPlugin)
public class ExternalDisplayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ExternalDisplay"
    public let jsName = "ExternalDisplay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openWindow", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        ExternalDisplay.shared.plugin = self
    }

    @objc func send(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("json missing")
            return
        }
        DispatchQueue.main.async {
            ExternalDisplay.shared.sendToOutput(json)
            call.resolve()
        }
    }

    @objc func isConnected(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["connected": ExternalDisplay.shared.isConnected])
        }
    }

    @objc func openWindow(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            ExternalDisplay.shared.openOutputWindow()
            call.resolve()
        }
    }
}
