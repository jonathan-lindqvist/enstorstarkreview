# R8 rules for release builds. kotlinx.serialization, OkHttp, Coil, Compose, and Play services
# ship their own consumer rules; the generated API models are found through their serializers.

# Line numbers in crash reports from Play.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
