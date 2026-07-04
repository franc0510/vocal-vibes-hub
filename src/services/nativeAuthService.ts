import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";

/**
 * Native Authentication Service for iOS
 * Opens OAuth in in-app browser, then closes it after auth completes
 */

// Store listener reference
let urlOpenListener: any = null;

/**
 * Setup deeplink listener to detect when OAuth completes
 */
function setupDeeplinkListener(): Promise<void> {
  return new Promise((resolve) => {
    // Remove old listener if exists
    if (urlOpenListener) {
      urlOpenListener.remove();
    }

    // Listen for URL open events (deeplinks)
    urlOpenListener = App.addListener("appUrlOpen", async (event) => {
      console.log("�� Deeplink received:", event.url);

      if (event.url.includes("auth") || event.url.includes("callback") || event.url.startsWith("vocme://")) {
        // Close the browser
        try {
          await Browser.close();
          console.log("📱 Browser closed via deeplink");
        } catch (e) {
          console.log("Browser close error (may already be closed):", e);
        }

        // Wait a bit for session to establish
        setTimeout(async () => {
          const { data } = await supabase.auth.getSession();
          if (data?.session) {
            console.log("✅ Session found after deeplink");
          }
          resolve();
        }, 500);
      }
    });
  });
}

/**
 * Apple Sign-In
 */
export async function nativeAppleSignIn() {
  try {
    console.log("🍎 Starting Apple Sign-In...");

    if (!Capacitor.isNativePlatform()) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      return;
    }

    // Setup deeplink listener BEFORE opening browser
    const deeplinkPromise = setupDeeplinkListener();

    // Redirect to your Vercel app's auth-callback page which will trigger the deeplink
    const webAppUrl = "https://vocme-tawny.vercel.app";
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: `${webAppUrl}/auth-callback.html`,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;

    if (data?.url) {
      console.log("📱 Opening Apple Sign-In...");
      
      await Browser.open({
        url: data.url,
        windowName: "_blank",
        presentationStyle: "popover",
      });

      // Listen for browser finished event
      Browser.addListener("browserFinished", async () => {
        console.log("📱 Browser finished event");
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          console.log("✅ Session established after browser close");
        }
      });

      // Wait for session
      await Promise.race([
        deeplinkPromise,
        waitForSession(60000),
      ]);

      return;
    }
  } catch (err) {
    console.error("❌ Apple Sign-In error:", err);
    throw err;
  }
}

/**
 * Google Sign-In
 */
export async function nativeGoogleSignIn() {
  try {
    console.log("🔵 Starting Google Sign-In...");

    if (!Capacitor.isNativePlatform()) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) throw error;
      return;
    }

    // Setup deeplink listener BEFORE opening browser
    const deeplinkPromise = setupDeeplinkListener();

    // Redirect to your Vercel app's auth-callback page which will trigger the deeplink
    const webAppUrl = "https://vocme-tawny.vercel.app";

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${webAppUrl}/auth-callback.html`,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) throw error;

    if (data?.url) {
      console.log("📱 Opening Google Sign-In...");
      
      await Browser.open({
        url: data.url,
        windowName: "_blank",
        presentationStyle: "popover",
      });

      // Listen for browser finished event
      Browser.addListener("browserFinished", async () => {
        console.log("📱 Browser finished event");
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          console.log("✅ Session established after browser close");
        }
      });

      // Wait for session
      await Promise.race([
        deeplinkPromise,
        waitForSession(60000),
      ]);

      return;
    }
  } catch (err) {
    console.error("❌ Google Sign-In error:", err);
    throw err;
  }
}

/**
 * Wait for session to be established
 */
function waitForSession(timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkSession = setInterval(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();

        if (sessionData?.session?.user) {
          clearInterval(checkSession);
          console.log("✅ Session established");
          
          // Close browser if still open
          try {
            await Browser.close();
          } catch (e) {
            // Browser might already be closed
          }
          
          resolve(sessionData.session.user);
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkSession);
          reject(new Error("Sign-in timeout"));
        }
      } catch (err) {
        console.error("Session check error:", err);
      }
    }, 1000);
  });
}
