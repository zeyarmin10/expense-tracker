package com.ethan.expensetracker;

import com.getcapacitor.BridgeActivity;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // Extend content behind both status bar and navigation bar (edge-to-edge).
        // Required so env(safe-area-inset-bottom) is non-zero in the WebView,
        // which fixes bottom-nav overlap on Android 15+ (API 35 forced edge-to-edge).
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setNavigationBarColor(Color.TRANSPARENT);

        // Match app dark theme — prevents white flash before WebView content loads
        getBridge().getWebView().setBackgroundColor(Color.parseColor("#020817"));
        // Remove white overscroll glow when pulling past top/bottom
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }
}
