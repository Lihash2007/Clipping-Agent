import torch
from torch.utils.data import DataLoader
import os
import sys

# Import the dataset and model architecture from train.py
from train import CustomVideoDataset, SimpleObjectDetector

def test_model():
    print("Initializing Test Dataset (500 samples)...")
    test_dataset = CustomVideoDataset(num_samples=500)
    test_dataloader = DataLoader(test_dataset, batch_size=32, shuffle=False)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    
    model = SimpleObjectDetector(num_classes=10).to(device)
    
    weights_path = os.path.join(os.path.dirname(__file__), "weights", "custom_detector.pth")
    if not os.path.exists(weights_path):
        print(f"Error: Could not find trained weights at {weights_path}")
        sys.exit(1)
        
    print(f"Loading trained weights from {weights_path}...")
    model.load_state_dict(torch.load(weights_path, map_location=device))
    model.eval()
    
    correct_predictions = 0
    total_samples = 0
    
    print("Testing model accuracy...")
    with torch.no_grad():
        for batch_idx, (images, bboxes, labels) in enumerate(test_dataloader):
            images, bboxes, labels = images.to(device), bboxes.to(device), labels.to(device)
            
            # Forward pass
            pred_classes, pred_boxes = model(images)
            
            # 1. Classification Accuracy
            _, predicted_labels = torch.max(pred_classes, 1)
            correct_predictions += (predicted_labels == labels).sum().item()
            total_samples += labels.size(0)
            
            # 2. Bounding Box Avg Error
            mse_error = torch.nn.functional.mse_loss(pred_boxes, bboxes, reduction='mean').item()
            
    final_accuracy = (correct_predictions / total_samples) * 100
    print("\n" + "="*50)
    print("TEST RESULTS:")
    print("="*50)
    print(f"Total Samples Tested: {total_samples}")
    print(f"Classification Accuracy: {final_accuracy:.2f}%")
    print(f"Bounding Box Avg Error (MSE): {mse_error:.4f}")
    
    if final_accuracy >= 90.0:
        print("\nSUCCESS: Model successfully maintained >90% accuracy on test set!")
    else:
        print("\nWARNING: Model accuracy fell below 90% threshold on test set.")

if __name__ == "__main__":
    test_model()
