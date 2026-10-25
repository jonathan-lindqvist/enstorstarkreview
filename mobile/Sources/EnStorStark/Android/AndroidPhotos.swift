#if os(Android)
import SwiftUI
import EnStorStarkModel

/// Decoded review photos, so cards do not decode again when they scroll back.
@MainActor enum ReviewImageCache {
    static let images: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 60
        return cache
    }()

    static func key(path: String, preview: APIClient.ImagePreview) -> NSString {
        NSString(string: "\(path)?preview=\(preview.rawValue)")
    }
}

/// A review photo that fills its frame around the focus point. Loads through the API client
/// (draft photos need the token) and shows a warm placeholder while it loads or when it fails.
struct ReviewPhoto: View {
    let image: ReviewImage
    var preview: APIClient.ImagePreview = .card
    @Environment(AppModel.self) var app
    @State var loaded: UIImage?

    var body: some View {
        ZStack {
            if let loaded {
                FocusedFill(image: Image(uiImage: loaded), focusX: image.focusX, focusY: image.focusY)
            } else {
                PhotoPlaceholder()
            }
        }
        .clipped()
        .task(id: image.url) { await load() }
    }

    func load() async {
        let key = ReviewImageCache.key(path: image.url, preview: preview)
        if let cached = ReviewImageCache.images.object(forKey: key) {
            loaded = cached
            return
        }
        guard let data = try? await app.api.imageData(path: image.url, preview: preview),
              let decoded = await DisplayImage.decode(data) else { return }
        ReviewImageCache.images.setObject(decoded, forKey: key)
        loaded = decoded
    }
}

struct PhotoPlaceholder: View {
    var body: some View {
        ZStack {
            Ess.raised2
            EssIconView(.mug, size: 48, color: Color.white.opacity(0.14))
        }
    }
}

/// The feed card: the photo fills the card, and the details sit on a dark fade at its foot.
struct ReviewCard: View {
    let review: Review

    var body: some View {
        ReviewCardLayout(
            rating: review.overallRating,
            title: review.title,
            excerpt: review.excerpt,
            authors: review.authorNames,
            brand: review.beerBrandText,
            street: review.street,
            priceKr: review.beer.priceKr,
            isHappyHour: review.beer.isHappyHourPrice,
            isDraft: review.isDraft
        ) {
            ReviewPhoto(image: review.image, preview: .detail)
        }
    }
}

/// The layout of a feed card around any photo view.
struct ReviewCardLayout<Photo: View>: View {
    let rating: Int
    let title: String
    let excerpt: String
    let authors: [String]
    let brand: String
    let street: String
    let priceKr: Int?
    let isHappyHour: Bool
    let isDraft: Bool
    @ViewBuilder var photo: () -> Photo

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            photo()
            LinearGradient(stops: [
                Gradient.Stop(color: Color.black.opacity(0), location: 0.35),
                Gradient.Stop(color: Color.black.opacity(0.78), location: 0.72),
                Gradient.Stop(color: Color.black.opacity(0.92), location: 1)
            ], startPoint: .top, endPoint: .bottom)
            info.padding(18)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 380)
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(alignment: .topLeading) {
            if isDraft { DraftTag(onPhoto: true).padding(14) }
        }
    }

    var info: some View {
        VStack(alignment: .leading, spacing: 6) {
            RatingLine(rating: rating, size: 15, wordColor: Ess.secondary)
            Text(title)
                .font(Ess.headlineMedium)
                .foregroundStyle(.white)
                .lineLimit(1)
            if !excerpt.isEmpty {
                Text(excerpt)
                    .font(Ess.bodyMedium)
                    .foregroundStyle(Color.white.opacity(0.75))
                    .lineLimit(2)
            }
            if !authors.isEmpty {
                ReviewerLine(names: authors, avatarSize: 22, ring: Color.black.opacity(0.6))
            }
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(brand).font(.system(size: 14, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                    Text(street).font(Ess.bodySmall).foregroundStyle(Ess.secondary).lineLimit(1)
                }
                Spacer(minLength: 8)
                PriceLabel(priceKr: priceKr, isHappyHour: isHappyHour, size: 40)
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Compact row for search results (a Material list item).
struct ReviewRow: View {
    let review: Review

    var body: some View {
        HStack(spacing: 16) {
            ReviewPhoto(image: review.image)
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(alignment: .topLeading) {
                    if review.isDraft {
                        EssIconView(.lock, size: 12, color: .black)
                            .frame(width: 20, height: 20)
                            .background(Circle().fill(Ess.amber))
                            .padding(4)
                    }
                }
            VStack(alignment: .leading, spacing: 2) {
                Text(review.title).font(.system(size: 16, weight: .bold)).foregroundStyle(Ess.text).lineLimit(1)
                Text(review.excerpt).font(Ess.bodyMedium).foregroundStyle(Ess.secondary).lineLimit(1)
                HStack(spacing: 6) {
                    Stars(rating: review.overallRating, size: 12)
                    Text(verbatim: "\(review.street) · \(Formatting.shortDate(review.createdAt))")
                        .font(Ess.bodySmall)
                        .foregroundStyle(Ess.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            PriceLabel(priceKr: review.beer.priceKr, isHappyHour: review.beer.isHappyHourPrice, size: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }
}
#endif
