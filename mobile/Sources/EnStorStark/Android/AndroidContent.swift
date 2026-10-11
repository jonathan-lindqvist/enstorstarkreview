import Foundation

// Reads `content://` URLs, which the Android photo picker returns. Foundation in native Swift
// can only read files, so the transpiled code below asks the Android content resolver.

#if SKIP
import android.net.Uri

/// The bytes behind a `content://` URL, or nil when the resolver cannot open it.
public func readAndroidContent(uri: String) -> Data? {
    let context = ProcessInfo.processInfo.androidContext
    guard let stream = context.contentResolver.openInputStream(Uri.parse(uri)) else { return nil }
    let bytes = stream.readBytes()
    stream.close()
    return Data(platformValue: bytes)
}
#endif
