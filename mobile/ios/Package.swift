// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "mobile",
    defaultLocalization: "sv",
    // macOS only so that `swift test` can run the model tests on the Mac; the app is iOS only.
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "EnStorStark", type: .dynamic, targets: ["EnStorStark"]),
        .library(name: "EnStorStarkModel", type: .dynamic, targets: ["EnStorStarkModel"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator.git", from: "1.10.0"),
        .package(url: "https://github.com/apple/swift-openapi-runtime.git", from: "1.8.0"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession.git", from: "1.1.0"),
        .package(url: "https://github.com/apple/swift-http-types.git", from: "1.0.0"),
    ],
    targets: [
        .target(name: "EnStorStark", dependencies: ["EnStorStarkModel"], resources: [.process("Resources")]),
        .target(name: "EnStorStarkModel", dependencies: [
            "EnStorStarkAPI",
            .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            .product(name: "HTTPTypes", package: "swift-http-types"),
        ], resources: [.process("Resources")]),
        // Plain Swift client generated from ../../openapi/v1.yaml (symlinked as openapi.yaml).
        .target(name: "EnStorStarkAPI", dependencies: [
            .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime")
        ], plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]),
        .testTarget(name: "EnStorStarkModelTests", dependencies: [
            "EnStorStarkModel",
            .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
            .product(name: "HTTPTypes", package: "swift-http-types"),
        ], resources: [.copy("Fixtures")]),
    ]
)
