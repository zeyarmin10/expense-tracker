package com.ethan.expensetracker;

import com.getcapacitor.BridgeActivity;

import android.os.Build;
import android.os.Bundle;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        //     getWindow().setDecorFitsSystemWindows(false);
        // } else {
        //     ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, insets) -> {
        //         WindowInsetsCompat systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
        //         v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
        //         return insets;
        //     });
        // }
    }
}