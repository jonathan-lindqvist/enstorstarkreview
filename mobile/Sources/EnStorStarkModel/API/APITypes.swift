import EnStorStarkAPI

// Short names for the generated schema types that the app uses directly.

public typealias Review = Components.Schemas.Review
public typealias ReviewSort = Components.Schemas.ReviewSort
public typealias ReviewMetadata = Components.Schemas.ReviewMetadata
public typealias ReviewHistory = Components.Schemas.ReviewHistory
public typealias ReviewMap = Components.Schemas.ReviewMap
public typealias ReviewStatistics = Components.Schemas.ReviewStatistics
public typealias ProblemCode = Components.Schemas.ProblemCode

/// A response value with the `ETag` that the server sent for it.
public struct Tagged<Value: Sendable>: Sendable {
    public var value: Value
    public var eTag: String?

    public init(value: Value, eTag: String?) {
        self.value = value
        self.eTag = eTag
    }
}

public typealias StatisticBar = Components.Schemas.StatisticBar
public typealias ReviewMarker = Components.Schemas.MapMarker
public typealias RatingMetric = Components.Schemas.RatingMetric
public typealias RatingKey = Components.Schemas.RatingKey
public typealias ImageContentType = Components.Schemas.ImageContentType
public typealias ReviewFields = Components.Schemas.ReviewFields
public typealias ImageUpload = Components.Schemas.ImageUpload
