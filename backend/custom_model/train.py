import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import torchvision.transforms as transforms
import numpy as np
import cv2
import os

# ==========================================
# 1. Dataset & Preprocessing (Feature Engineering)
# ==========================================
class CustomVideoDataset(Dataset):
    """
    A custom dataset loader that handles preprocessing and feature engineering.
    In a real scenario, this would load images and parse XML/JSON bounding boxes.
    Here we generate synthetic training data to demonstrate the architecture.
    """
    def __init__(self, num_samples=1000, img_size=224):
        self.num_samples = num_samples
        self.img_size = img_size
        
        # Feature Engineering: Data Augmentation pipeline
        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.ColorJitter(brightness=0.2, contrast=0.2), # Robustness to lighting
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

    def __len__(self):
        return self.num_samples

    def __getitem__(self, idx):
        # Generate a synthetic image (e.g., a background with a shape)
        img = np.random.randint(0, 255, (self.img_size, self.img_size, 3), dtype=np.uint8)
        
        # Ground truth bounding box [x_center, y_center, width, height] normalized (0 to 1)
        # And class label (0 to num_classes-1)
        bbox = torch.tensor([0.5, 0.5, 0.2, 0.2], dtype=torch.float32) 
        label = torch.tensor(1, dtype=torch.long) # e.g., class 1 is "head"
        
        # Apply preprocessing
        img_tensor = self.transform(img)
        return img_tensor, bbox, label

# ==========================================
# 2. Custom Model Architecture
# ==========================================
class SimpleObjectDetector(nn.Module):
    """
    A custom Convolutional Neural Network built from scratch for Object Detection.
    It outputs both a class prediction and bounding box coordinates.
    """
    def __init__(self, num_classes=10):
        super(SimpleObjectDetector, self).__init__()
        
        # Feature Extractor (Backbone)
        self.features = nn.Sequential(
            nn.Conv2d(3, 16, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2), # 112x112
            
            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2), # 56x56
            
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2), # 28x28
            
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2)  # 14x14
        )
        
        # Detection Head (Classification + Regression)
        self.classifier = nn.Sequential(
            nn.Linear(128 * 14 * 14, 512),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(512, num_classes) # Outputs logits for classes
        )
        
        self.box_regressor = nn.Sequential(
            nn.Linear(128 * 14 * 14, 512),
            nn.ReLU(),
            nn.Linear(512, 4), # Outputs [x, y, w, h]
            nn.Sigmoid() # Normalize between 0 and 1
        )

    def forward(self, x):
        features = self.features(x)
        features_flat = features.view(features.size(0), -1)
        
        classes = self.classifier(features_flat)
        boxes = self.box_regressor(features_flat)
        return classes, boxes

# ==========================================
# 3. Training Loop
# ==========================================
def train_model(target_accuracy=90.0, batch_size=32, lr=0.001):
    print("Initializing Custom Dataset and DataLoader...")
    dataset = CustomVideoDataset(num_samples=1000)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    
    model = SimpleObjectDetector(num_classes=10).to(device)
    
    # Loss functions
    class_criterion = nn.CrossEntropyLoss()
    box_criterion = nn.MSELoss() # Mean Squared Error for bounding box regression
    
    optimizer = optim.Adam(model.parameters(), lr=lr)
    
    print(f"Starting Training Loop until {target_accuracy}% accuracy is reached...")
    epoch = 0
    best_accuracy = 0.0
    
    while best_accuracy < target_accuracy:
        epoch += 1
        model.train()
        total_loss = 0.0
        correct_predictions = 0
        total_samples = 0
        
        for batch_idx, (images, bboxes, labels) in enumerate(dataloader):
            images, bboxes, labels = images.to(device), bboxes.to(device), labels.to(device)
            
            # Forward pass
            optimizer.zero_grad()
            pred_classes, pred_boxes = model(images)
            
            # Calculate accuracy
            _, predicted_labels = torch.max(pred_classes, 1)
            correct_predictions += (predicted_labels == labels).sum().item()
            total_samples += labels.size(0)
            
            # Compute loss
            loss_cls = class_criterion(pred_classes, labels)
            loss_box = box_criterion(pred_boxes, bboxes)
            
            # Combine losses (can weight them differently)
            loss = loss_cls + (loss_box * 10) 
            
            # Backward pass and optimize
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            
            if batch_idx % 10 == 0:
                current_acc = (correct_predictions / total_samples) * 100
                print(f"Epoch [{epoch}], Batch [{batch_idx}/{len(dataloader)}], Loss: {loss.item():.4f}, Accuracy: {current_acc:.2f}%")
                
        epoch_accuracy = (correct_predictions / total_samples) * 100
        best_accuracy = max(best_accuracy, epoch_accuracy)
        print(f"=== Epoch {epoch} Completed. Average Loss: {total_loss/len(dataloader):.4f}, Epoch Accuracy: {epoch_accuracy:.2f}% ===")
        
    # Save the custom trained weights
    os.makedirs(os.path.join(os.path.dirname(__file__), "weights"), exist_ok=True)
    weights_path = os.path.join(os.path.dirname(__file__), "weights", "custom_detector.pth")
    torch.save(model.state_dict(), weights_path)
    print(f"Target accuracy of {target_accuracy}% reached! Model training complete and saved to {weights_path}")

if __name__ == "__main__":
    train_model(target_accuracy=90.0)
