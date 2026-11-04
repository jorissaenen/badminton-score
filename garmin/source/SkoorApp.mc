import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! Skoor on a Garmin watch: link it once to your account (QR code or key), then pick a match being
//! played in your clubs and keep its score with the buttons, together with phones and other watches,
//! or start a game of your own on the watch (any sport, also timed ones like basketball).
class SkoorApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        Look.setup();
        if (Api.token() == null) {
            return [new LinkView(), new LinkDelegate()];
        }
        var home = new HomeView();
        return [home, new HomeDelegate(home)];
    }
}
