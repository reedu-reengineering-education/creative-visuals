import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()
        windowScene.lockLandscape()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        (scene as? UIWindowScene)?.lockLandscape()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

extension UIWindowScene {
    /// Lichtwerk is landscape only. Info.plist says so, but the app supports
    /// multitasking (for the output window under Stage Manager), and then
    /// iPadOS doesn't enforce the plist on its own – so ask for it at runtime.
    /// In a resizable Stage Manager window iPadOS may still ignore the request.
    func lockLandscape() {
        guard #available(iOS 16.0, *) else { return }
        for window in windows {
            window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        }
        requestGeometryUpdate(.iOS(interfaceOrientations: .landscape)) { _ in
            // refused (e.g. in a Stage Manager window): nothing else to do
        }
    }
}

/// Landscape only, for every screen of the app.
enum LandscapeOnly {
    static let orientations: UIInterfaceOrientationMask = .landscape
}
