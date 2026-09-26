// swift-tools-version: 6.1
// This is a Skip (https://skip.dev) package.
import PackageDescription

let package = Package(
    name: "mobile",
    defaultLocalization: "sv",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "EnStorStark", type: .dynamic, targets: ["EnStorStark"]),
        .library(name: "EnStorStarkModel", type: .dynamic, targets: ["EnStorStarkModel"]),
    ],
    dependencies: [
        .package(url: "https://github.com/skiptools/skip.git", from: "1.9.11"),
        .package(url: "https://github.com/skiptools/skip-fuse-ui.git", from: "1.0.0"),
        .package(url: "https://github.com/skiptools/skip-fuse.git", from: "1.0.0"),
        .package(url: "https://github.com/skiptools/skip-model.git", from: "1.0.0")
    ],
    targets: [
        .target(name: "EnStorStark", dependencies: [
            "EnStorStarkModel",
            .product(name: "SkipFuseUI", package: "skip-fuse-ui")
        ], resources: [.process("Resources")], plugins: [.plugin(name: "skipstone", package: "skip")]),
        .target(name: "EnStorStarkModel", dependencies: [
            .product(name: "SkipFuse", package: "skip-fuse"),
            .product(name: "SkipModel", package: "skip-model")
        ], resources: [.process("Resources")], plugins: [.plugin(name: "skipstone", package: "skip")]),
    ]
)
