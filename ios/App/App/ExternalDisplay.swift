import UIKit
import WebKit
import Capacitor

/// Projector support: when a display is connected (HDMI/USB-C adapter or AirPlay), iOS hands the app
/// a separate scene for it. That scene shows /output while the iPad keeps the editor, like Keynote.
/// The two web views exchange the same SyncMessages the web version sends over BroadcastChannel
/// (see src/lib/sync.ts); this class relays them.
final class ExternalDisplay {
    static let shared = ExternalDisplay()

    weak var plugin: ExternalDisplayPlugin?
    private weak var outputWebView: WKWebView?

    var isConnected: Bool { outputWebView != nil }

    func attach(_ webView: WKWebView) {
        outputWebView = webView
        plugin?.notifyListeners("display", data: ["connected": true])
    }

    func detach() {
        outputWebView = nil
        plugin?.notifyListeners("display", data: ["connected": false])
    }

    /// Editor -> output. `json` is a serialised SyncMessage, which is also a valid JS literal.
    func sendToOutput(_ json: String) {
        outputWebView?.evaluateJavaScript("window.__lichtwerkReceive?.(\(json)); 0", completionHandler: nil)
    }

    /// Output -> editor.
    func sendToEditor(_ json: String) {
        plugin?.notifyListeners("message", data: ["json": json])
    }
}

/// Scene for the role `windowExternalDisplayNonInteractive` (see AppDelegate).
final class ExternalDisplaySceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = .black
        window.rootViewController = OutputViewController()
        window.isHidden = false
        self.window = window
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        window = nil
        ExternalDisplay.shared.detach()
    }
}

/// A plain web view (no Capacitor bridge) that serves the bundled web app like the main one does.
final class OutputViewController: UIViewController, WKScriptMessageHandler {
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
}
