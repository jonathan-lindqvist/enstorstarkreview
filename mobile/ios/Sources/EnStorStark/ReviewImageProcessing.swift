import Foundation
import UIKit

/// Prepares a picked or captured photo for upload.
///
/// The API accepts JPEG, PNG, and WebP up to 15 MB, so HEIC photos must be converted. The app
/// always sends JPEG and scales large photos down, which keeps uploads small. On iOS this also
/// applies the EXIF orientation to the pixels.
enum ReviewImageProcessing {
    static let maxDimension: CGFloat = 2560

    struct Prepared {
        let jpeg: Data
        let preview: UIImage
    }

    /// A photo from the library, as file data (HEIC, JPEG, PNG, …).
    static func prepare(data: Data) -> Prepared? {
        guard let image = UIImage(data: data) else { return nil }
        return prepare(image: image)
    }

    /// A photo from the camera.
    static func prepare(image: UIImage) -> Prepared? {
        let scaled = redraw(image)
        guard let jpeg = scaled.jpegData(compressionQuality: 0.85) else { return nil }
        return Prepared(jpeg: jpeg, preview: scaled)
    }

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
}
