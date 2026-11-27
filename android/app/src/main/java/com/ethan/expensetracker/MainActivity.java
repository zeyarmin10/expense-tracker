package com.ethan.expensetracker;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        // Force window background dark before EdgeToEdge/Capacitor setup
        // prevents white frame showing through transparent status bar during splash exit
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.parseColor("#020817")));
        EdgeToEdge.enable(this);
        registerPlugin(AppToastPlugin.class);
        super.onCreate(savedInstanceState);

        getBridge().getWebView().setBackgroundColor(Color.parseColor("#020817"));
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Full-screen overlays pad their header by --native-status-bar-inset.
        // The CSS fallback is a fixed 28px, which is too short on phones with a
        // tall status bar / camera cutout, so hand the web layer the real height.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                injectStatusBarInset();
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) injectStatusBarInset();
    }

    /**
     * Sets --native-status-bar-inset on <html> to the status bar (or display
     * cutout, whichever is taller) height in CSS px. Reads the root insets
     * instead of adding an insets listener, so Capacitor's own SystemBars
     * listener on the WebView's parent is left untouched.
     */
    private void injectStatusBarInset() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(webView);
        if (insets == null) return;
        Insets top = insets.getInsets(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
        float density = getResources().getDisplayMetrics().density;
        int topCssPx = Math.round(top.top / density);
        if (topCssPx <= 0) return; // status bar hidden: keep the last/fallback value
        webView.evaluateJavascript(
            "document.documentElement.style.setProperty('--native-status-bar-inset','" + topCssPx + "px')",
            null
        );
    }
}
