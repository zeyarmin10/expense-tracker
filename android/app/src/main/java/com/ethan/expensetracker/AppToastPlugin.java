package com.ethan.expensetracker;

import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppToast")
public class AppToastPlugin extends Plugin {
    private TextView activeToast;
    private Typeface appTypeface;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable hideRunnable = this::hideActiveToast;

    @PluginMethod
    public void show(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("Must provide text");
            return;
        }

        String durationType = call.getString("duration", "short");
        String kind = call.getString("kind", "info");
        int durationMs = "long".equals(durationType) ? 3500 : 2200;
        int bottomOffsetDp = call.getInt("bottomOffsetDp", 132);

        getActivity().runOnUiThread(() -> {
            showToastView(text, kind, bottomOffsetDp, durationMs);
            call.resolve();
        });
    }

    private void showToastView(String text, String kind, int bottomOffsetDp, int durationMs) {
        hideActiveToast();

        FrameLayout root = getActivity().findViewById(android.R.id.content);
        float density = getContext().getResources().getDisplayMetrics().density;
        int horizontalMargin = Math.round(24 * density);

        TextView toast = new TextView(getContext());
        ToastColors colors = colorsForKind(kind);
        toast.setText(text);
        toast.setTextColor(Color.parseColor(colors.text));
        toast.setTextSize(16);
        toast.setTypeface(getAppTypeface(), Typeface.BOLD);
        toast.setGravity(Gravity.CENTER);
        toast.setMaxLines(3);
        toast.setPadding(
            Math.round(16 * density),
            Math.round(10 * density),
            Math.round(16 * density),
            Math.round(10 * density)
        );

        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.parseColor(colors.background));
        background.setStroke(Math.round(1 * density), Color.parseColor(colors.border));
        background.setCornerRadius(Math.round(16 * density));
        toast.setBackground(background);
        toast.setElevation(Math.round(12 * density));
        toast.setAlpha(0f);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        params.leftMargin = horizontalMargin;
        params.rightMargin = horizontalMargin;
        params.bottomMargin = Math.round(bottomOffsetDp * density);

        root.addView(toast, params);
        activeToast = toast;

        toast.animate().alpha(1f).setDuration(140).start();
        handler.removeCallbacks(hideRunnable);
        handler.postDelayed(hideRunnable, durationMs);
    }

    private Typeface getAppTypeface() {
        if (appTypeface != null) {
            return appTypeface;
        }

        try {
            appTypeface = Typeface.createFromAsset(getContext().getAssets(), "public/assets/fonts/MyanmarUI.ttf");
        } catch (RuntimeException error) {
            appTypeface = Typeface.DEFAULT;
        }

        return appTypeface;
    }

    private ToastColors colorsForKind(String kind) {
        switch (kind) {
            case "success":
                return new ToastColors("#EAFBF4", "#087F5B", "#A6E9D5");
            case "error":
                return new ToastColors("#FFF0F0", "#D92D20", "#FFC9C9");
            case "warning":
                return new ToastColors("#FFF8E6", "#B54708", "#FFD88A");
            default:
                return new ToastColors("#EAF3FF", "#0B5FDB", "#B8D8FF");
        }
    }

    private static class ToastColors {
        final String background;
        final String text;
        final String border;

        ToastColors(String background, String text, String border) {
            this.background = background;
            this.text = text;
            this.border = border;
        }
    }

    private void hideActiveToast() {
        handler.removeCallbacks(hideRunnable);
        if (activeToast == null) {
            return;
        }

        View toast = activeToast;
        activeToast = null;
        toast.animate()
            .alpha(0f)
            .setDuration(120)
            .withEndAction(() -> {
                ViewGroup parent = (ViewGroup) toast.getParent();
                if (parent != null) {
                    parent.removeView(toast);
                }
            })
            .start();
    }
}
