import SwiftUI

struct DraggableView: View {
    @State private var offsetY: CGFloat = 0
    
    func dragGesture(height: CGFloat) -> some Gesture {
        DragGesture()
            .onChanged { value in
                self.offsetY = value.translation.height
            }
            .onEnded { value in
                let predicted = value.predictedEndTranslation.height
                let velocity = (predicted - value.translation.height) / max(height, 1)
                if velocity > 500 {
                    self.offsetY = height
                } else {
                    self.offsetY = 0
                }
            }
    }
    
    var body: some View {
        Rectangle()
            .fill(Color.blue)
            .frame(height: 300)
            .offset(y: offsetY)
            .gesture(dragGesture(height: 300))
    }
}

struct DraggableView_Previews: PreviewProvider {
    static var previews: some View {
        DraggableView()
    }
}
