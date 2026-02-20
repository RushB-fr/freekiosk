# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# -----------------------------------------------------------------------
# HiveMQ MQTT client – optional dependencies not present on Android
# -----------------------------------------------------------------------

# Netty epoll (Linux-only, not shipped in the Android AAR)
-dontwarn io.netty.channel.epoll.Epoll
-dontwarn io.netty.channel.epoll.EpollEventLoopGroup
-dontwarn io.netty.channel.epoll.EpollSocketChannel

# Netty HTTP / WebSocket codec (optional transport)
-dontwarn io.netty.handler.codec.http.**
-dontwarn io.netty.handler.codec.http.websocketx.**

# Netty proxy handlers (optional)
-dontwarn io.netty.handler.proxy.HttpProxyHandler
-dontwarn io.netty.handler.proxy.ProxyHandler
-dontwarn io.netty.handler.proxy.Socks4ProxyHandler
-dontwarn io.netty.handler.proxy.Socks5ProxyHandler

# Netty tcnative / OpenSSL native bindings (not available on Android)
-dontwarn io.netty.internal.tcnative.**

# Jetty ALPN / NPN (obsolete, superseded by Android TLS stack)
-dontwarn org.eclipse.jetty.alpn.**
-dontwarn org.eclipse.jetty.npn.**

# SLF4J (optional logging facade used by HiveMQ / Netty)
-dontwarn org.slf4j.**

# Log4J 1.x / 2.x (optional logging backends used by Netty)
-dontwarn org.apache.log4j.**
-dontwarn org.apache.logging.log4j.**

# BlockHound (testing/debugging tool, not needed at runtime)
-dontwarn reactor.blockhound.**
-dontwarn io.netty.util.internal.Hidden$NettyBlockHoundIntegration
