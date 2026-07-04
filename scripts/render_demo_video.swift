import AppKit
import AVFoundation
import CoreMedia
import CoreVideo
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let frameDir = root.appendingPathComponent("output/video/frames")
let audioURL = root.appendingPathComponent("output/video/CashPilot_3_Minute_Demo_narration.aiff")
let silentURL = root.appendingPathComponent("output/video/CashPilot_3_Minute_Demo_silent.mov")
let finalURL = root.appendingPathComponent("output/video/CashPilot_3_Minute_Demo.mov")

let width = 1280
let height = 720
let timescale: CMTimeScale = 600
let slideDurations: [Double] = [20, 20, 20, 25, 25, 25, 25, 20]
let totalDuration = slideDurations.reduce(0, +)

func removeIfExists(_ url: URL) {
    if FileManager.default.fileExists(atPath: url.path) {
        try? FileManager.default.removeItem(at: url)
    }
}

func loadImage(_ url: URL) throws -> CGImage {
    guard let image = NSImage(contentsOf: url),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        throw NSError(domain: "CashPilotVideo", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unable to load image \(url.path)"])
    }
    return cgImage
}

func makePixelBuffer(from image: CGImage) throws -> CVPixelBuffer {
    var maybeBuffer: CVPixelBuffer?
    let attributes: [CFString: Any] = [
        kCVPixelBufferCGImageCompatibilityKey: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey: true,
        kCVPixelBufferWidthKey: width,
        kCVPixelBufferHeightKey: height,
        kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32ARGB
    ]

    let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32ARGB, attributes as CFDictionary, &maybeBuffer)
    guard status == kCVReturnSuccess, let buffer = maybeBuffer else {
        throw NSError(domain: "CashPilotVideo", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to create pixel buffer"])
    }

    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard let context = CGContext(
        data: CVPixelBufferGetBaseAddress(buffer),
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    ) else {
        throw NSError(domain: "CashPilotVideo", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unable to create graphics context"])
    }

    context.setFillColor(NSColor(calibratedRed: 0.02, green: 0.03, blue: 0.09, alpha: 1).cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.interpolationQuality = .high

    let sourceAspect = CGFloat(image.width) / CGFloat(image.height)
    let targetAspect = CGFloat(width) / CGFloat(height)
    var drawRect: CGRect
    if sourceAspect > targetAspect {
        let drawHeight = CGFloat(width) / sourceAspect
        drawRect = CGRect(x: 0, y: (CGFloat(height) - drawHeight) / 2, width: CGFloat(width), height: drawHeight)
    } else {
        let drawWidth = CGFloat(height) * sourceAspect
        drawRect = CGRect(x: (CGFloat(width) - drawWidth) / 2, y: 0, width: drawWidth, height: CGFloat(height))
    }
    context.draw(image, in: drawRect)
    return buffer
}

func renderSilentVideo() throws {
    removeIfExists(silentURL)

    let writer = try AVAssetWriter(outputURL: silentURL, fileType: .mov)
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: 3_000_000,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
        ]
    ]

    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
        assetWriterInput: input,
        sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height
        ]
    )

    guard writer.canAdd(input) else {
        throw NSError(domain: "CashPilotVideo", code: 4, userInfo: [NSLocalizedDescriptionKey: "Cannot add writer input"])
    }
    writer.add(input)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    var currentTime = 0.0
    for index in 1...slideDurations.count {
        let frameURL = frameDir.appendingPathComponent("cashpilot_video-\(index).png")
        let image = try loadImage(frameURL)
        let buffer = try makePixelBuffer(from: image)
        while !input.isReadyForMoreMediaData {
            Thread.sleep(forTimeInterval: 0.01)
        }
        adaptor.append(buffer, withPresentationTime: CMTime(seconds: currentTime, preferredTimescale: timescale))
        currentTime += slideDurations[index - 1]
    }

    let finalFrame = try makePixelBuffer(from: loadImage(frameDir.appendingPathComponent("cashpilot_video-\(slideDurations.count).png")))
    adaptor.append(finalFrame, withPresentationTime: CMTime(seconds: totalDuration - 0.05, preferredTimescale: timescale))
    input.markAsFinished()

    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting {
        semaphore.signal()
    }
    semaphore.wait()

    if writer.status != .completed {
        throw writer.error ?? NSError(domain: "CashPilotVideo", code: 5, userInfo: [NSLocalizedDescriptionKey: "Silent video render failed"])
    }
}

func muxAudioIfAvailable() {
    guard FileManager.default.fileExists(atPath: audioURL.path) else {
        try? FileManager.default.copyItem(at: silentURL, to: finalURL)
        return
    }

    removeIfExists(finalURL)
    let composition = AVMutableComposition()
    let videoAsset = AVURLAsset(url: silentURL)
    let audioAsset = AVURLAsset(url: audioURL)
    let videoDuration = CMTime(seconds: totalDuration, preferredTimescale: timescale)

    guard let sourceVideoTrack = videoAsset.tracks(withMediaType: .video).first,
          let compositionVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        try? FileManager.default.copyItem(at: silentURL, to: finalURL)
        return
    }

    do {
        try compositionVideoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: videoDuration), of: sourceVideoTrack, at: .zero)
        if let sourceAudioTrack = audioAsset.tracks(withMediaType: .audio).first,
           let compositionAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
            let audioDuration = min(audioAsset.duration, videoDuration)
            try compositionAudioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: audioDuration), of: sourceAudioTrack, at: .zero)
        }
    } catch {
        try? FileManager.default.copyItem(at: silentURL, to: finalURL)
        return
    }

    guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
        try? FileManager.default.copyItem(at: silentURL, to: finalURL)
        return
    }

    exporter.outputURL = finalURL
    exporter.outputFileType = .mov
    exporter.timeRange = CMTimeRange(start: .zero, duration: videoDuration)

    let semaphore = DispatchSemaphore(value: 0)
    exporter.exportAsynchronously {
        semaphore.signal()
    }
    semaphore.wait()

    if exporter.status != .completed {
        try? FileManager.default.removeItem(at: finalURL)
        try? FileManager.default.copyItem(at: silentURL, to: finalURL)
    }
}

do {
    try renderSilentVideo()
    muxAudioIfAvailable()
    print(finalURL.path)
} catch {
    fputs("Video render failed: \(error)\n", stderr)
    exit(1)
}
