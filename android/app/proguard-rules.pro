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
# HiveMQ MQTT client + Netty + dependencies
# Official rules from: https://hivemq.github.io/hivemq-mqtt-client/docs/installation/android/
# and: https://github.com/hivemq/hivemq-mqtt-client/issues/390
#
# Netty JCTools uses Unsafe.objectFieldOffset(getDeclaredField("consumerIndex"))
# -keepclassmembernames preserves field/method names without blocking obfuscation
# of class names — unlike -keep which R8 ignores for member name preservation.
# -----------------------------------------------------------------------

# Preserve HiveMQ MQTT client classes (auth builders, codecs, Dagger IoC, etc.)
# HiveMQ uses a staged builder pattern (Mqtt3SimpleAuthBuilder.Nested → .Complete)
# and Dagger 2 for dependency injection with lazy InstanceHolder singletons.
# R8 can merge/devirtualize these interface hierarchies, causing
# AbstractMethodError or IncompatibleClassChangeError on older ART runtimes
# (Android 11 and below) when the auth code path is taken.
-keep class com.hivemq.client.** { *; }

# Preserve Dagger 2 and javax.inject used internally by HiveMQ
# (42 InstanceHolder lazy-init factories, DaggerSingletonComponent, etc.)
-keep class dagger.** { *; }
-keep class javax.inject.** { *; }

# Preserve RxJava 2 used by HiveMQ for reactive streams
-keepclassmembers class io.reactivex.** { *; }
-dontwarn io.reactivex.**

# Preserve Netty field/method names (JCTools Unsafe reflection)
-keepclassmembernames class io.netty.** { *; }

# Preserve JCTools field/method names (non-shaded variant)
-keepclassmembers class org.jctools.** { *; }

# -----------------------------------------------------------------------
# -dontwarn: suppress warnings for optional dependencies not present on Android
# -----------------------------------------------------------------------

# Netty epoll (Linux-only)
-dontwarn io.netty.channel.epoll.**

# Netty HTTP / WebSocket codec (optional transport)
-dontwarn io.netty.handler.codec.http.**
-dontwarn io.netty.handler.codec.http.websocketx.**

# Netty proxy handlers (optional)
-dontwarn io.netty.handler.proxy.**

# Netty tcnative / OpenSSL native bindings
-dontwarn io.netty.internal.tcnative.**

# Jetty ALPN / NPN (obsolete)
-dontwarn org.eclipse.jetty.alpn.**
-dontwarn org.eclipse.jetty.npn.**

# SLF4J (optional logging facade)
-dontwarn org.slf4j.**

# Log4J 1.x / 2.x (optional logging backends)
-dontwarn org.apache.log4j.**
-dontwarn org.apache.logging.log4j.**

# BlockHound (testing/debugging tool)
-dontwarn reactor.blockhound.**
-dontwarn io.netty.util.internal.Hidden$NettyBlockHoundIntegration

# Netty uses sun.misc.Unsafe and internal JDK APIs via reflection
-dontwarn sun.misc.Unsafe
-dontwarn java.lang.invoke.**

# Optional Netty dependencies not present on Android (compression, codecs, etc.)
-dontwarn com.aayushatharva.brotli4j.**
-dontwarn com.github.luben.zstd.**
-dontwarn com.google.protobuf.**
-dontwarn com.google.protobuf.nano.**
-dontwarn com.jcraft.jzlib.**
-dontwarn com.ning.compress.**
-dontwarn com.oracle.svm.core.annotate.**
-dontwarn lzma.sdk.**
-dontwarn net.jpountz.lz4.**
-dontwarn net.jpountz.xxhash.**
-dontwarn org.jboss.marshalling.**
-dontwarn org.osgi.annotation.bundle.Export
