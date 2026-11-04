import UIKit
import Capacitor

/// The editor. Registers the app's own plugins.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ExternalDisplayPlugin())
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        LandscapeOnly.orientations
    }
}
