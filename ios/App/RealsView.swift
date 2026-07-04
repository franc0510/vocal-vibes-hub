import SwiftUI
import SDWebImageSwiftUI
import CoreHaptics

struct RealItem: Identifiable, Equatable {
    let id = UUID()
    let url: URL
}

struct RealsView: View {
    @State private var items: [RealItem] = [
        RealItem(url: URL(string: "https://raw.githubusercontent.com/ibireme/YYImage/master/Demo/YYImageDemo/mew_baseline.jpg")!),
        RealItem(url: URL(string: "https://via.placeholder.com/800x1200.jpg")!),
        RealItem(url: URL(string: "https://raw.githubusercontent.com/recurser/exif-orientation-examples/master/Landscape_5.jpg")!)
    ]
    @State private var index: Int = 0
    @State private var dragOffset: CGFloat = 0
    @State private var engine: CHHapticEngine?

    private let thresholdRatio: CGFloat = 0.28

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(items.indices, id: \.self) { i in
                    RealPage(item: items[i])
                        .frame(width: geo.size.width, height: geo.size.height)
                        .offset(y: pageOffset(for: i, height: geo.size.height))
                        .animation(.interactiveSpring(response: 0.25, dampingFraction: 0.85, blendDuration: 0.2), value: dragOffset)
                        .animation(.interactiveSpring(response: 0.25, dampingFraction: 0.85, blendDuration: 0.2), value: index)
                        .allowsHitTesting(i == index)
                }
            }
            .contentShape(Rectangle())
            .gesture(dragGesture(height: geo.size.height))
            .onAppear { prepareHaptics() }
            .background(Color.black.ignoresSafeArea())
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private func pageOffset(for i: Int, height: CGFloat) -> CGFloat {
        let base = CGFloat(i - index) * height
        return base + dragOffset
    }

    private func dragGesture(height: CGFloat) -> some Gesture {
        DragGesture()
            .onChanged { value in
                dragOffset = max(-height, min(height, value.translation.height))
            }
            .onEnded { value in
                let predicted = value.predictedEndTranslation.height
                let velocity = (predicted - value.translation.height) / max(height, 1)
                let ratio = value.translation.height / height
                var newIndex = index

                if ratio < -thresholdRatio || (ratio < 0 && velocity < -0.8) {
                    newIndex = min(index + 1, items.count - 1)
                    hapticTick()
                } else if ratio > thresholdRatio || (ratio > 0 && velocity > 0.8) {
                    newIndex = max(index - 1, 0)
                    hapticTick()
                }

                withAnimation(.interactiveSpring(response: 0.25, dampingFraction: 0.85)) {
                    index = newIndex
                    dragOffset = 0
                }
            }
    }

    private func prepareHaptics() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        do {
            engine = try CHHapticEngine()
            try engine?.start()
        } catch { }
    }

    private func hapticTick() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
        let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.5)
        let event = CHHapticEvent(eventType: .hapticTransient, parameters: [sharpness, intensity], relativeTime: 0)
        do {
            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine?.makePlayer(with: pattern)
            try player?.start(atTime: 0)
        } catch {}
    }
}

private struct RealPage: View {
    let item: RealItem
    var body: some View {
        ZStack {
            Color.black
            WebImage(url: item.url)
                .resizable()
                .indicator(.activity)
                .transition(.fade(duration: 0.35))
                .scaledToFill()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
        }
        .ignoresSafeArea()
    }
}

#Preview {
    NavigationStack {
        RealsView()
    }
}
