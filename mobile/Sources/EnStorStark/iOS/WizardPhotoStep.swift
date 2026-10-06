#if !os(Android)
import SwiftUI
import UIKit
import SkipKit
import EnStorStarkModel

/// Step 1: take or choose a photo, then move the square that the feed card shows.
struct WizardPhotoStep: View {
    @Bindable var form: ReviewFormModel
    @Binding var photo: UIImage?
    @State var isPickingFromLibrary = false
    @State var isTakingPhoto = false
    @State var pickedURL: URL?
    @State var isProcessing = false

    var hasCamera: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let photo {
                    WizardTitle(title: "Välj utsnitt", subtitle: "Dra rutan. Det som syns i den blir kortet i flödet.")
                    PhotoCropper(image: photo, focusX: $form.draft.focusX, focusY: $form.draft.focusY)
                        .frame(maxWidth: .infinity)
                    HStack(spacing: 10) {
                        if hasCamera {
                            Button { isTakingPhoto = true } label: { ButtonLabel(text: "Ta nytt", icon: "camera.fill") }
                                .buttonStyle(SecondaryButtonStyle(height: 46))
                                .accessibilityIdentifier("wizard.photo.camera")
                        }
                        Button { isPickingFromLibrary = true } label: { ButtonLabel(text: "Välj en annan", icon: "photo.on.rectangle") }
                            .buttonStyle(SecondaryButtonStyle(height: 46))
                            .accessibilityIdentifier("wizard.photo.library")
                    }
                } else {
                    emptyState
                }
                FieldError(message: form.error(for: "/image", "/image/data", "/image/contentType", "/imageFocus", "/imageFocus/x", "/imageFocus/y"))
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize)
        // One picker for each view: two pickers on one view present only one of them.
        .background { Color.clear.withMediaPicker(type: .library, isPresented: $isPickingFromLibrary, selectedImageURL: $pickedURL) }
        .background { Color.clear.withMediaPicker(type: .camera, isPresented: $isTakingPhoto, selectedImageURL: $pickedURL) }
        .onChange(of: pickedURL) { _, url in
            if let url { usePickedImage(url) }
        }
    }

    var emptyState: some View {
        VStack(spacing: 22) {
            WizardTitle(title: "Börja med en bild", subtitle: "Få med baren. Bilden blir kortet i flödet.", size: 38)
            ZStack {
                RoundedRectangle(cornerRadius: 30, style: .continuous).fill(Color.white.opacity(0.04))
                CropCorners().stroke(Theme.amber, style: .init(lineWidth: 4, lineCap: .round))
                    .shadow(color: Theme.amber.opacity(0.6), radius: 6)
                if isProcessing {
                    ProgressView().tint(Theme.amber).controlSize(.large)
                } else {
                    Image(systemName: "mug.fill").font(.system(size: 64, weight: .semibold)).foregroundStyle(.white.opacity(0.14))
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .accessibilityHidden(true)
            VStack(spacing: 10) {
                if hasCamera {
                    Button { isTakingPhoto = true } label: { ButtonLabel(text: "Ta foto", icon: "camera.fill") }
                        .buttonStyle(PrimaryButtonStyle())
                        .accessibilityIdentifier("wizard.photo.camera")
                }
                Button { isPickingFromLibrary = true } label: { ButtonLabel(text: "Välj från biblioteket", icon: "photo.on.rectangle") }
                    .buttonStyle(hasCamera ? AnyButtonStyle(SecondaryButtonStyle()) : AnyButtonStyle(PrimaryButtonStyle()))
                    .accessibilityIdentifier("wizard.photo.library")
            }
        }
    }

    func usePickedImage(_ url: URL) {
        isProcessing = true
        defer { isProcessing = false }
        guard let prepared = ReviewImageProcessing.prepare(fileURL: url) else { return }
        form.setImage(data: prepared.jpeg, contentType: .imageJpeg)
        form.draft.focusX = 50
        form.draft.focusY = 50
        photo = prepared.preview
    }
}

/// A button style chosen at run time.
struct AnyButtonStyle: ButtonStyle {
    private let make: (Configuration) -> AnyView
    init<Style: ButtonStyle>(_ style: Style) {
        make = { AnyView(style.makeBody(configuration: $0)) }
    }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}

/// The whole photo with the square crop of the feed card lit and the rest dimmed. Drag to move
/// the square. The focus point uses the same rule as `FocusedFill`.
struct PhotoCropper: View {
    let image: UIImage
    @Binding var focusX: Double
    @Binding var focusY: Double
    @State var dragStart: CGPoint?

    var aspect: CGFloat {
        image.size.height > 0 ? image.size.width / image.size.height : 1
    }

    var body: some View {
        Image(uiImage: image)
            .resizable()
            .aspectRatio(aspect, contentMode: .fit)
            .overlay { GeometryReader { proxy in cropOverlay(size: proxy.size) } }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .frame(maxHeight: 460)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text("Bildutsnitt"))
            .accessibilityValue(Text(aspect >= 1 ? "\(Int(focusX)) procent från vänster" : "\(Int(focusY)) procent uppifrån"))
            .accessibilityHint(Text("Svep uppåt eller nedåt för att flytta rutan."))
            .accessibilityAdjustableAction { direction in
                let step: Double = direction == .increment ? 10 : -10
                if aspect >= 1 { focusX = min(max(focusX + step, 0), 100) } else { focusY = min(max(focusY + step, 0), 100) }
            }
            .accessibilityIdentifier("wizard.photo.crop")
    }

    func cropOverlay(size: CGSize) -> some View {
        let side = min(size.width, size.height)
        let slack = CGSize(width: size.width - side, height: size.height - side)
        let crop = CGRect(x: slack.width * focusX / 100, y: slack.height * focusY / 100, width: side, height: side)
        return ZStack(alignment: .topLeading) {
            Path { path in
                path.addRect(CGRect(origin: .zero, size: size))
                path.addRoundedRect(in: crop, cornerSize: CGSize(width: 22, height: 22), style: .continuous)
            }
            .fill(Color.black.opacity(0.6), style: FillStyle(eoFill: true))
            CropCorners()
                .stroke(Theme.amber, style: .init(lineWidth: 4, lineCap: .round))
                .shadow(color: Theme.amber.opacity(0.6), radius: 6)
                .frame(width: crop.width - 8, height: crop.height - 8)
                .offset(x: crop.minX + 4, y: crop.minY + 4)
        }
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 0)
            .onChanged { drag in
                let start = dragStart ?? crop.origin
                if dragStart == nil { dragStart = start }
                if slack.width > 1 {
                    focusX = min(max((start.x + drag.translation.width) / slack.width, 0), 1) * 100
                }
                if slack.height > 1 {
                    focusY = min(max((start.y + drag.translation.height) / slack.height, 0), 1) * 100
                }
            }
            .onEnded { _ in dragStart = nil })
    }
}

/// Four rounded corner brackets, like a camera guide.
struct CropCorners: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let length = min(34, rect.width / 4), radius = min(26, rect.width / 6)
        path.move(to: CGPoint(x: rect.minX, y: rect.minY + radius + length))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
        path.addQuadCurve(to: CGPoint(x: rect.minX + radius, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX + radius + length, y: rect.minY))
        path.move(to: CGPoint(x: rect.maxX - radius - length, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY + radius), control: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + radius + length))
        path.move(to: CGPoint(x: rect.maxX, y: rect.maxY - radius - length))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addQuadCurve(to: CGPoint(x: rect.maxX - radius, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX - radius - length, y: rect.maxY))
        path.move(to: CGPoint(x: rect.minX + radius + length, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + radius, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - radius), control: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - radius - length))
        return path
    }
}
#endif
