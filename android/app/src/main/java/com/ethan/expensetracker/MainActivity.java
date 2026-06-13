package com.ethan.expensetracker;

import com.getcapacitor.BridgeActivity;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        // Force window background dark before EdgeToEdge/Capacitor setup
        // prevents white frame showing through transparent status bar during splash exit
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.parseColor("#020817")));
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);

        getBridge().getWebView().setBackgroundColor(Color.parseColor("#020817"));
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }
}
