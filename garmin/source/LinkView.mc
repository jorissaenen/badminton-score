import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

//! First start: link this watch to an account. Shows a QR code and a key; on the phone, scan the QR
//! code or type the key (Skoor: You → Watches) and confirm. Meanwhile the watch asks every 3 seconds
//! whether it's linked; then it gets its own key and shows the matches.
class LinkView extends WatchUi.View {
    private var _key as String? = null;
    private var _secret as String? = null;
    private var _qr as Array? = null;
    private var _message as String = "Connecting…";
    private var _busy as Boolean = false;
    private var _timer as Timer.Timer?;

    function initialize() {
        View.initialize();
    }

    function onShow() as Void {
        if (_key == null) {
            requestKey();
        }
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 3000, true);
    }

    function onHide() as Void {
        if (_timer != null) {
            _timer.stop();
        }
    }

    function requestKey() as Void {
        _busy = true;
        Api.post("/link/start", { "model" => "Garmin watch" }, method(:onKey));
    }

    function onKey(code as Number, data as Dictionary or String or Null) as Void {
        _busy = false;
        if (code == 200 && data instanceof Dictionary) {
            _key = data["key"] as String;
            _secret = data["secret"] as String;
            _qr = data["qr"] as Array;
        } else {
            _message = Api.problem(code);
        }
        WatchUi.requestUpdate();
    }

    function onTick() as Void {
        if (_busy) {
            return;
        }
        if (_key == null) {
            requestKey();
            return;
        }
        _busy = true;
        Api.post("/link/poll", { "key" => _key, "secret" => _secret }, method(:onPoll));
    }

    function onPoll(code as Number, data as Dictionary or String or Null) as Void {
        _busy = false;
        if (code == 200 && data instanceof Dictionary && "linked".equals(data["status"])) {
            Api.setToken(data["token"] as String);
            Look.buzzDone();
            var list = new MatchesView();
            WatchUi.switchToView(list, new MatchesDelegate(list), WatchUi.SLIDE_LEFT);
        } else if (code == 410) {
            _key = null; // too old: ask for a new key
            _qr = null;
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Look.BLACK, Look.BLACK);
        dc.clear();
        Look.text(dc, w / 2, (h * 0.10).toNumber(), Graphics.FONT_XTINY, "LINK TO SKOOR", Look.MUTED);
        if (_qr == null || _key == null) {
            Look.text(dc, w / 2, h / 2, Graphics.FONT_TINY, _message, Look.WHITE);
            return;
        }
        // The QR code: white with a quiet zone of one module, as large as fits in the middle.
        var qr = _qr as Array;
        var n = qr.size();
        var cell = ((h * 0.54) / (n + 2)).toNumber();
        if (cell < 2) {
            cell = 2;
        }
        var size = cell * (n + 2);
        var x0 = (w - size) / 2;
        var y0 = (h * 0.17).toNumber();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_WHITE);
        dc.fillRectangle(x0, y0, size, size);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        for (var r = 0; r < n; r++) {
            var row = (qr[r] as String).toCharArray();
            for (var c = 0; c < row.size(); c++) {
                if (row[c] == '1') {
                    dc.fillRectangle(x0 + cell * (c + 1), y0 + cell * (r + 1), cell, cell);
                }
            }
        }
        var key = _key as String;
        var y = y0 + size + (h * 0.07).toNumber();
        Look.text(dc, w / 2, y, Graphics.FONT_MEDIUM, key.substring(0, 3) + " " + key.substring(3, 6), Look.WHITE);
        Look.text(dc, w / 2, y + (h * 0.09).toNumber(), Graphics.FONT_XTINY, "Scan, or Skoor: You > Watches", Look.MUTED);
    }
}

//! While linking, BACK closes the app as usual; nothing else to press.
class LinkDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }
}
