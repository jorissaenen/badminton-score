import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! The menus: during a match (undo, touch scoring, another match, unlink) and on the list of matches.
module Menus {
    function showMatch(view as ScoreView) as Void {
        var menu = new WatchUi.Menu2({ :title => "Skoor" });
        menu.addItem(new WatchUi.MenuItem("Undo last point", null, :undo, null));
        menu.addItem(touchItem());
        menu.addItem(new WatchUi.MenuItem("Other match", null, :other, null));
        menu.addItem(new WatchUi.MenuItem("Unlink watch", null, :unlink, null));
        WatchUi.pushView(menu, new MatchMenuDelegate(view), WatchUi.SLIDE_UP);
    }

    //! Touch scoring on or off; on a watch without a touch screen (Fenix 6) it stays in the list,
    //! saying why it can't be switched on.
    function touchItem() as WatchUi.MenuItem {
        if (!System.getDeviceSettings().isTouchScreen) {
            return new WatchUi.MenuItem("Touch scoring", "No touch screen: buttons only", :notouch, null);
        }
        return new WatchUi.ToggleMenuItem("Touch scoring", "Tap top or bottom half", :touch, Api.touchScoring(), null);
    }

    function showLinked() as Void {
        var menu = new WatchUi.Menu2({ :title => "Skoor" });
        menu.addItem(touchItem());
        menu.addItem(new WatchUi.MenuItem("Unlink watch", null, :unlink, null));
        WatchUi.pushView(menu, new MatchMenuDelegate(null), WatchUi.SLIDE_UP);
    }
}

class MatchMenuDelegate extends WatchUi.Menu2InputDelegate {
    private var _view as ScoreView?;

    function initialize(view as ScoreView?) {
        Menu2InputDelegate.initialize();
        _view = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :touch) {
            Api.setTouchScoring((item as WatchUi.ToggleMenuItem).isEnabled());
            return;
        }
        if (id == :notouch) {
            return;
        }
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id == :undo && _view != null) {
            (_view as ScoreView).press("undo");
        } else if (id == :other && _view != null) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        } else if (id == :unlink) {
            unlinked();
        }
    }
}
