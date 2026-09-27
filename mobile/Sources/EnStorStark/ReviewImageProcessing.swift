import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Prepares a picked or captured photo for upload.
///
/// The API accepts JPEG, PNG, and WebP up to 15 MB, so HEIC photos must be converted. The app
/// always sends JPEG. On iOS it also scales large photos down, which keeps uploads small and
/// applies the EXIF orientation to the pixels.
enum ReviewImageProcessing {
    #if !os(Android)
    static let maxDimension: CGFloat = 2560
    #endif

    struct Prepared {
        let jpeg: Data
        let preview: UIImage
    }

    static func prepare(fileURL: URL) -> Prepared? {
        guard let data = try? Data(contentsOf: fileURL), let image = UIImage(data: data) else {
            return nil
        }
        #if os(Android)
        // SkipFuseUI cannot draw into a new bitmap, so Android only re-encodes the photo.
        guard let jpeg = image.jpegData(compressionQuality: 0.85) else { return nil }
        return Prepared(jpeg: jpeg, preview: image)
        #else
        let scaled = redraw(image)
        guard let jpeg = scaled.jpegData(compressionQuality: 0.85) else { return nil }
        return Prepared(jpeg: jpeg, preview: scaled)
        #endif
    }

    #if !os(Android)
    /// Draws the photo upright, and at most `maxDimension` points on its longest side.
    static func redraw(_ image: UIImage) -> UIImage {
        let size = image.size
        let longest = max(size.width, size.height)
        let scale = longest > maxDimension ? maxDimension / longest : 1
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
    #endif
}
