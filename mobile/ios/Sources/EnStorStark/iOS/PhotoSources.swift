import PhotosUI
import SwiftUI
import UIKit

extension View {
    /// The system photo picker and the camera for one review photo. The library picker runs out of
    /// process and needs no photo permission; the camera asks for camera access.
    func reviewPhotoSources(
        isPickingFromLibrary: Binding<Bool>,
        isTakingPhoto: Binding<Bool>,
        isProcessing: Binding<Bool>,
        onPicked: @escaping (ReviewImageProcessing.Prepared?) -> Void
    ) -> some View {
        modifier(ReviewPhotoSources(isPickingFromLibrary: isPickingFromLibrary, isTakingPhoto: isTakingPhoto, isProcessing: isProcessing, onPicked: onPicked))
    }
}

private struct ReviewPhotoSources: ViewModifier {
    @Binding var isPickingFromLibrary: Bool
    @Binding var isTakingPhoto: Bool
    @Binding var isProcessing: Bool
    let onPicked: (ReviewImageProcessing.Prepared?) -> Void
    @State private var item: PhotosPickerItem?

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: $isPickingFromLibrary, selection: $item, matching: .images, preferredItemEncoding: .current)
            .onChange(of: item) { _, picked in
                guard let picked else { return }
                item = nil
                isProcessing = true
                Task {
                    let data = try? await picked.loadTransferable(type: Data.self)
                    onPicked(data.flatMap(ReviewImageProcessing.prepare(data:)))
                    isProcessing = false
                }
            }
            .fullScreenCover(isPresented: $isTakingPhoto) {
                CameraPicker { image in onPicked(ReviewImageProcessing.prepare(image: image)) }
                    .ignoresSafeArea()
            }
    }
}

/// The system camera (UIImagePickerController).
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
