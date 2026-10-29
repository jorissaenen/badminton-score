import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! Skoor on a Garmin watch: link it once to your account (QR code or key), then pick a match being
//! played in your clubs and keep its score with the buttons, together with phones and other watches.
class SkoorApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        Look.setup();
        if (Api.token() == null) {
            return [new LinkView(), new LinkDelegate()];
        }
        var list = new MatchesView();
        return [list, new MatchesDelegate(list)];
    }
}
