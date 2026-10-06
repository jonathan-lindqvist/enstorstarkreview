#if !os(Android)
import SwiftUI
import UIKit
import EnStorStarkModel

/// Decoded review photos, so cards do not decode again when they scroll back.
/// A sign-out does not need to clear it: the app drops the `AppModel` and its API client, and
/// the cache only holds images that this app session was allowed to load.
@MainActor enum ReviewImageCache {
    static let images: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 80
        return cache
    }()
}

/// Loads a review photo through the API client (draft photos need the token) and gives it to
/// `content`. Shows a warm placeholder while it loads or when it fails.
struct LoadedReviewImage<Content: View>: View {
    let path: String
    @ViewBuilder var content: (UIImage) -> Content
    @Environment(AppModel.self) var app
    @State var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                content(image)
            } else {
                PhotoPlaceholder()
            }
        }
        .task(id: path) { await load() }
    }

    func load() async {
        if let cached = ReviewImageCache.images.object(forKey: path as NSString) {
            image = cached
            return
        }
        guard let data = try? await app.api.imageData(path: path), let loaded = UIImage(data: data) else { return }
        ReviewImageCache.images.setObject(loaded, forKey: path as NSString)
        image = loaded
    }
}

struct PhotoPlaceholder: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(white: 0.16), Color(white: 0.08)], startPoint: .topLeading, endPoint: .bottomTrailing)
            Image(systemName: "mug.fill").font(.system(size: 40, weight: .semibold)).foregroundStyle(.white.opacity(0.12))
        }
    }
}

/// A review photo that fills its frame around the focus point.
struct ReviewPhoto: View {
    let image: ReviewImage

    var body: some View {
        LoadedReviewImage(path: image.url) { loaded in
            FocusedFill(image: Image(uiImage: loaded), focusX: image.focusX, focusY: image.focusY)
        }
        .clipped()
    }
}


/// A square photo at the top; a heavily blurred copy of the same photo fills the rest, and the
/// photo's lower edge fades into it. Used by feed cards and the review hero.
struct SquarePhotoOnBlur: View {
    let image: ReviewImage
    /// How far down the crisp photo stays fully visible (0…1 of its height).
    var solidUntil: CGFloat = 0.55

    var body: some View {
        LoadedReviewImage(path: image.url) { loaded in
            SquareImageOnBlur(image: Image(uiImage: loaded), focusX: image.focusX, focusY: image.focusY, solidUntil: solidUntil)
        }
        .clipped()
    }
}

/// `SquarePhotoOnBlur` for an image that is already loaded, for example a new photo.
struct SquareImageOnBlur: View {
    let image: Image
    let focusX: Double
    let focusY: Double
    var solidUntil: CGFloat = 0.55

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack(alignment: .top) {
                image.resizable().scaledToFill()
                    .frame(width: width, height: proxy.size.height)
                    .blur(radius: 50, opaque: true)
                    .saturation(1.4)
                    .scaleEffect(1.3)
                    .clipped()
                FocusedFill(image: image, focusX: focusX, focusY: focusY)
                    .frame(width: width, height: min(width, proxy.size.height))
                    .mask(LinearGradient(stops: [.init(color: .black, location: solidUntil),
                                                 .init(color: .clear, location: 1)],
                                         startPoint: .top, endPoint: .bottom))
            }
            .frame(width: width, height: proxy.size.height, alignment: .top)
        }
        .clipped()
    }
}

/// Feed card: square photo on its blurred colour field, rating, title, excerpt, reviewers,
/// brand, street, and price.
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
            SquarePhotoOnBlur(image: review.image)
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
        ZStack(alignment: .bottom) {
            photo()
            LinearGradient(stops: [.init(color: .black.opacity(0), location: 0.35),
                                   .init(color: .black.opacity(0.5), location: 0.65),
                                   .init(color: .black.opacity(0.7), location: 1)],
                           startPoint: .top, endPoint: .bottom)
            info.padding(18)
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(alignment: .topLeading) {
            if isDraft { DraftTag(onPhoto: true).padding(16) }
        }
        .contentShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: 9) {
            RatingLine(rating: rating, size: 13, wordColor: .white.opacity(0.7))
            Text(title)
                .font(Theme.title(34))
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
            if !excerpt.isEmpty {
                Text(excerpt)
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(2)
            }
            if !authors.isEmpty {
                ReviewerLine(names: authors)
            }
            HStack(alignment: .lastTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(brand).font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
                    Text(street).font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
                }
                .lineLimit(1)
                Spacer()
                PriceLabel(priceKr: priceKr, isHappyHour: isHappyHour)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Compact row for search results.
struct ReviewRow: View {
    let review: Review

    var body: some View {
        HStack(spacing: 14) {
            ReviewPhoto(image: review.image)
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(alignment: .topLeading) {
                    if review.isDraft {
                        Image(systemName: "lock.fill").font(.system(size: 10, weight: .bold)).foregroundStyle(.black)
                            .frame(width: 22, height: 22).background(Theme.amber, in: Circle()).padding(5)
                            .accessibilityLabel(Text("Utkast"))
                    }
                }
            VStack(alignment: .leading, spacing: 3) {
                Text(review.title).font(Theme.title(17)).foregroundStyle(Theme.text).lineLimit(1)
                Text(review.excerpt).font(.system(size: 13)).foregroundStyle(Theme.secondary).lineLimit(1)
                HStack(spacing: 6) {
                    Stars(rating: review.overallRating, size: 10)
                    Text(verbatim: "\(review.street) · \(Formatting.shortDate(review.createdAt))")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            PriceLabel(priceKr: review.beer.priceKr, isHappyHour: review.beer.isHappyHourPrice, size: 22, glow: false)
        }
        .contentShape(Rectangle())
    }
}
#endif
