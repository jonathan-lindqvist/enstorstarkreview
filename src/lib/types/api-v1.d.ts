/**
 * Generated from openapi/v1.yaml by scripts/generate-api-types.js.
 * Do not edit by hand. Run `npm run api:types` after changing the contract.
 */

export interface paths {
    "/images/{filename}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                filename: string;
            };
            cookie?: never;
        };
        /**
         * Download a review photo.
         * @description Use the `image.url` of a review instead of building this path. Images of drafts need
         *     authentication. Published images are immutable and can be cached forever.
         */
        get: operations["getImage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/map": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get map markers for published reviews with known coordinates.
         * @description Coordinates come from the server's geocode cache. A review without a resolved address
         *     has no marker. Clients must never send the device location to this API.
         */
        get: operations["getMap"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/map/geocoding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Geocode at most one published review address that has no marker.
         * @description Reviewers call this after the map is shown. The server makes at most one address
         *     attempt per call and returns 204 when there is nothing to do or another attempt is
         *     active.
         */
        post: operations["resolveNextMapMarker"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/review-metadata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Rating aspects, overall-rating rules, beer brands and input limits.
         * @description Clients render rating labels and build the review form from this data.
         */
        get: operations["getReviewMetadata"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/review-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ask the reviewers to review a bar.
         * @description Uses the same validation, rate limits and Discord delivery as the web form.
         *     The IP quota is consumed before parsing, including malformed requests. The JSON
         *     body must be at most 16 KiB. Only valid submissions consume the global delivery quota.
         */
        post: operations["createReviewRequest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List reviews.
         * @description Anonymous clients get only published reviews. Authenticated clients also get drafts.
         *     The search matches the title, location, description, beer brand and authors.
         */
        get: operations["listReviews"];
        put?: never;
        /**
         * Create a draft review.
         * @description New reviews are always drafts. Publish them with the publication endpoint.
         *     The JSON body must be at most 22 MiB; decoded images must be at most 15 MiB.
         */
        post: operations["createReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reviews/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: components["parameters"]["Slug"];
            };
            cookie?: never;
        };
        /**
         * Get one review.
         * @description Drafts return 404 to anonymous clients.
         */
        get: operations["getReview"];
        /**
         * Replace the editable fields of a review.
         * @description Any reviewer may edit any review. Send every editable field; omit `image` to keep the
         *     current photo and `attributes` to keep the current attributes. The publication status is never changed. The slug may change, so use
         *     the returned review's `slug` afterwards.
         *     The JSON body must be at most 22 MiB. If-Match requires a current strong entity tag;
         *     wildcard and weak-only preconditions return 412 and never permit an unconditional overwrite.
         */
        put: operations["updateReview"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reviews/{slug}/history": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: components["parameters"]["Slug"];
            };
            cookie?: never;
        };
        /** Get the change history of a review, newest first. */
        get: operations["getReviewHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reviews/{slug}/publication": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: components["parameters"]["Slug"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Publish a draft review.
         * @description Publication is one-way and keeps the credited authors.
         */
        post: operations["publishReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in with a username and password.
         * @description Uses the same credential checks, rate limits (per IP and per username) and audit
         *     events as the web login. The token is a session identifier with a 30-day sliding
         *     expiry: every authenticated request in the second half of its lifetime extends it.
         *     The IP limit is consumed before body parsing, including malformed requests. The
         *     JSON body must be at most 16 KiB; structurally valid bodies also consume the username limit.
         */
        post: operations["createSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sessions/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get the signed-in user and the token expiry. */
        get: operations["getCurrentSession"];
        put?: never;
        post?: never;
        /** Sign out and invalidate the token. */
        delete: operations["deleteCurrentSession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/statistics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get statistics for published reviews. */
        get: operations["getStatistics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List reviewer usernames for the author picker. */
        get: operations["listUsers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        BarAttribute: {
            key: components["schemas"]["BarAttributeKey"];
            /** @description Swedish label. */
            label: string;
        };
        /** @enum {string} */
        BarAttributeKey: "quiz" | "liveMusic" | "boardGames" | "shuffleboard" | "darts" | "billiards" | "karaoke" | "sportsTv";
        /** @description Bar features such as quiz or darts, in display order, without duplicates. */
        BarAttributes: components["schemas"]["BarAttributeKey"][];
        Beer: {
            /** @description Null for older reviews without a brand. */
            brand: string | null;
            isHappyHourPrice: boolean;
            /** @description Null for older reviews without a valid price. */
            priceKr: number | null;
        };
        BeerInput: {
            /** @description A suggested brand from the metadata or another brand name. */
            brand: string;
            isHappyHourPrice: boolean;
            priceKr: number;
        };
        FieldError: {
            /** @description Swedish message that clients can show next to the field. */
            detail: string;
            /**
             * @description JSON Pointer (RFC 6901) into the request body. Empty for the whole body.
             * @example /title
             * @example /beer/priceKr
             * @example /ratings/atmosphere
             */
            pointer: string;
        };
        /** @enum {string} */
        ImageContentType: "image/jpeg" | "image/png" | "image/webp";
        ImageFocus: {
            x: number;
            y: number;
        };
        ImageUpload: {
            contentType: components["schemas"]["ImageContentType"];
            /** @description Standard base64 without a data-URL prefix. Convert HEIC to JPEG first. */
            data: string;
        };
        MapMarker: {
            attributes: components["schemas"]["BarAttributes"];
            /** @description Null when the review has no valid price. */
            beer: {
                isHappyHourPrice: boolean;
                priceKr: number;
            } | null;
            latitude: number;
            location: string;
            longitude: number;
            overallRating: number;
            slug: string;
            title: string;
        };
        OverallRatingThreshold: {
            minimumWeightedScore: number;
            rating: number;
        };
        /** @description RFC 9457 problem details with a machine-readable `code`. */
        Problem: {
            code: components["schemas"]["ProblemCode"];
            /** @description Swedish message that clients can show. */
            detail: string;
            errors?: components["schemas"]["FieldError"][];
            status: number;
            /** @description Short English summary for logs. */
            title: string;
        };
        /** @enum {string} */
        ProblemCode: "bad_request" | "unauthorized" | "invalid_credentials" | "not_found" | "validation_failed" | "duplicate_slug" | "already_published" | "concurrent_update" | "precondition_failed" | "precondition_required" | "payload_too_large" | "unsupported_media_type" | "rate_limited" | "service_unavailable" | "internal_error";
        /** @enum {string} */
        PublicationStatus: "draft" | "published";
        /** @enum {string} */
        RatingKey: "atmosphere" | "service" | "selection" | "quality" | "price" | "cleanliness" | "soundLevel" | "barhopPotential";
        RatingMetric: {
            description: string;
            key: components["schemas"]["RatingKey"];
            label: string;
            weight: number;
        };
        /** @description Aspect ratings from 0 to 5. */
        Ratings: {
            atmosphere: number;
            barhopPotential: number;
            cleanliness: number;
            price: number;
            quality: number;
            selection: number;
            service: number;
            soundLevel: number;
        };
        /** @description Whole-number aspect ratings from 0 to 5. */
        RatingsInput: {
            atmosphere: number;
            barhopPotential: number;
            cleanliness: number;
            price: number;
            quality: number;
            selection: number;
            service: number;
            soundLevel: number;
        };
        Review: {
            attributes: components["schemas"]["BarAttributes"];
            /** @description Primary author. */
            author: string;
            beer: components["schemas"]["Beer"];
            coAuthors: string[];
            /** Format: date-time */
            createdAt: string;
            /** @description Markdown. */
            description: string;
            id: string;
            image: components["schemas"]["ReviewImage"];
            /** @description Street address. */
            location: string;
            overallRating: number;
            publicationStatus: components["schemas"]["PublicationStatus"];
            ratings: components["schemas"]["Ratings"];
            slug: string;
            title: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ReviewCreateRequest: components["schemas"]["ReviewFields"] & {
            image: components["schemas"]["ImageUpload"];
        };
        ReviewFieldChange: {
            after: string;
            before: string;
            field: string;
            /** @description Swedish field label. */
            label: string;
        };
        ReviewFields: {
            /**
             * @description Optional. When omitted, a new review gets no attributes and an edit keeps the
             *     current attributes. Send an empty array to remove all attributes.
             */
            attributes?: components["schemas"]["BarAttributes"];
            /**
             * @description Credited reviewers. The signed-in user becomes the primary author when selected;
             *     otherwise an existing primary author, then the first selection.
             */
            authors: string[];
            beer: components["schemas"]["BeerInput"];
            /** @description Markdown. */
            description: string;
            imageFocus: components["schemas"]["ImageFocus"];
            location: string;
            /** @description Optional. The server uses the suggested overall rating when it is omitted. */
            overallRating?: number;
            ratings: components["schemas"]["RatingsInput"];
            /** @description Optional. The server derives a slug from the title when it is omitted. */
            slug?: string;
            title: string;
        };
        ReviewHistory: {
            entries: components["schemas"]["ReviewHistoryEntry"][];
            slug: string;
            title: string;
        };
        ReviewHistoryEntry: {
            changes: components["schemas"]["ReviewFieldChange"][];
            /** Format: date-time */
            updatedAt: string;
            updatedBy: string;
        };
        ReviewImage: {
            /** @description Horizontal focus point in percent for cropping. */
            focusX: number;
            /** @description Vertical focus point in percent for cropping. */
            focusY: number;
            /** @description Path relative to the server origin, for example `/api/v1/images/<file>`. */
            url: string;
        };
        ReviewList: {
            reviews: components["schemas"]["Review"][];
        };
        ReviewMap: {
            markers: components["schemas"]["MapMarker"][];
        };
        ReviewMetadata: {
            /** @description Selectable bar attributes in display order. */
            barAttributes: components["schemas"]["BarAttribute"][];
            /** @description Suggested brands. Any other brand name is also accepted. */
            beerBrands: string[];
            limits: {
                beerBrandMaxLength: number;
                beerPriceMaxKr: number;
                beerPriceMinKr: number;
                descriptionMaxLength: number;
                imageContentTypes: components["schemas"]["ImageContentType"][];
                /** @description Maximum decoded image size. */
                imageMaxBytes: number;
                locationMaxLength: number;
                maxAuthors: number;
                slugMaxLength: number;
                titleMaxLength: number;
            };
            /**
             * @description The suggested overall rating is the highest `rating` whose
             *     `minimumWeightedScore` is at most the weighted sum of the aspect ratings, else 0.
             *     Reviewers may choose another value.
             */
            overallRating: {
                maximum: number;
                minimum: number;
                thresholds: components["schemas"]["OverallRatingThreshold"][];
            };
            /** @description Aspects in display order. The weights add up to 1. */
            ratingMetrics: components["schemas"]["RatingMetric"][];
        };
        ReviewRequestAccepted: {
            /** @description Swedish confirmation for the user. */
            message: string;
        };
        ReviewRequestCreateRequest: {
            barName: string;
            location: string;
            motivation?: string;
        };
        /**
         * @default latest
         * @enum {string}
         */
        ReviewSort: "latest" | "oldest" | "score";
        ReviewStatistics: {
            averageBeerPrice: number | null;
            averageRating: number | null;
            cheapestBars: components["schemas"]["StatisticBar"][];
            gothenburgReviews: number;
            happyHourPercentage: number | null;
            happyHourReviewCount: number;
            mostExpensiveBars: components["schemas"]["StatisticBar"][];
            priceReviewCount: number;
            totalReviews: number;
        };
        ReviewUpdateRequest: components["schemas"]["ReviewFields"] & {
            image?: components["schemas"]["ImageUpload"];
        };
        Session: {
            /** Format: date-time */
            expiresAt: string;
            user: components["schemas"]["User"];
        };
        SessionCreated: components["schemas"]["Session"] & {
            /** @description Store it in the Keychain or Android encrypted storage. */
            token: string;
        };
        SessionCreateRequest: {
            password: string;
            username: string;
        };
        StatisticBar: {
            beerPriceKr: number;
            isHappyHourPrice: boolean;
            slug: string;
            title: string;
        };
        User: {
            username: string;
        };
        UserList: {
            users: components["schemas"]["User"][];
        };
    };
    responses: {
        /** @description The body is not valid JSON. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description The request conflicts with the current state. `code` is `duplicate_slug`,
         *     `already_published` or `concurrent_update`.
         */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The server could not complete the request. */
        InternalError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The resource does not exist or is not visible to this client. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The cached representation is still current. */
        NotModified: {
            headers: {
                [name: string]: unknown;
            };
            content?: never;
        };
        /** @description The request body or image is too large. */
        PayloadTooLarge: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The `If-Match` value is not the current `ETag`. Reload and try again. */
        PreconditionFailed: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The `If-Match` header is missing. */
        PreconditionRequired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Too many requests. */
        RateLimited: {
            headers: {
                "Retry-After": components["headers"]["RetryAfter"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description A required service is not available. Try again later. */
        ServiceUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Authentication is missing, invalid or expired. */
        Unauthorized: {
            headers: {
                "WWW-Authenticate"?: string;
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The request body is not `application/json`. */
        UnsupportedMediaType: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description One or more fields are invalid. Structural schema validation stops at the first
         *     failure; clients should correct that field and retry. See `errors`.
         */
        ValidationFailed: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        Slug: string;
    };
    requestBodies: never;
    headers: {
        /** @description Entity tag of the response. Send it back in `If-None-Match` or `If-Match`. */
        ETag: string;
        /** @description Seconds to wait before a retry. */
        RetryAfter: number;
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getImage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                filename: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The image bytes. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "image/jpeg": string;
                    "image/png": string;
                    "image/webp": string;
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    getMap: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Map markers. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewMap"];
                };
            };
            304: components["responses"]["NotModified"];
        };
    };
    resolveNextMapMarker: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A new marker was resolved. Returns the updated map. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewMap"];
                };
            };
            /** @description No marker was resolved. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    getReviewMetadata: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Review metadata. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewMetadata"];
                };
            };
            304: components["responses"]["NotModified"];
        };
    };
    createReviewRequest: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReviewRequestCreateRequest"];
            };
        };
        responses: {
            /** @description The request was accepted for the reviewers. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewRequestAccepted"];
                };
            };
            400: components["responses"]["BadRequest"];
            413: components["responses"]["PayloadTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            502: components["responses"]["ServiceUnavailable"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    listReviews: {
        parameters: {
            query?: {
                search?: string;
                sort?: components["schemas"]["ReviewSort"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Matching reviews in the requested order. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewList"];
                };
            };
            304: components["responses"]["NotModified"];
        };
    };
    createReview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReviewCreateRequest"];
            };
        };
        responses: {
            /** @description Draft created. */
            201: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    /** @description API path of the new review. */
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Review"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["PayloadTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
            422: components["responses"]["ValidationFailed"];
            500: components["responses"]["InternalError"];
        };
    };
    getReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: components["parameters"]["Slug"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The review. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Review"];
                };
            };
            304: components["responses"]["NotModified"];
            404: components["responses"]["NotFound"];
        };
    };
    updateReview: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description The strong `ETag` from the last read of this review. A list is accepted when it
                 *     contains the current strong tag. Wildcards are rejected, even in a list; weak
                 *     tags never match. A missing header returns 428, a nonmatching header returns 412.
                 */
                "If-Match": string;
            };
            path: {
                slug: components["parameters"]["Slug"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReviewUpdateRequest"];
            };
        };
        responses: {
            /** @description Review updated. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Review"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            412: components["responses"]["PreconditionFailed"];
            413: components["responses"]["PayloadTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
            422: components["responses"]["ValidationFailed"];
            428: components["responses"]["PreconditionRequired"];
            500: components["responses"]["InternalError"];
        };
    };
    getReviewHistory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: components["parameters"]["Slug"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The change history. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewHistory"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    publishReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: components["parameters"]["Slug"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The published review. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Review"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            500: components["responses"]["InternalError"];
        };
    };
    createSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SessionCreateRequest"];
            };
        };
        responses: {
            /** @description Signed in. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCreated"];
                };
            };
            400: components["responses"]["BadRequest"];
            /** @description Wrong username or password. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            413: components["responses"]["PayloadTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
        };
    };
    getCurrentSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The current session. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Session"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    deleteCurrentSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Signed out. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    getStatistics: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Statistics. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewStatistics"];
                };
            };
            304: components["responses"]["NotModified"];
        };
    };
    listUsers: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Reviewers, sorted with Swedish collation. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserList"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
}
