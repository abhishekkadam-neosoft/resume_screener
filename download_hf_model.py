from huggingface_hub import snapshot_download

# Replace this with the model you want
MODEL_NAME = "Qwen/Qwen3-4B-Instruct-2507"

# Folder where the model will be stored
LOCAL_DIR = "./models/Qwen3-4B-Instruct-2507"

# Download the model
print(f"Downloading {MODEL_NAME} to {LOCAL_DIR} ...")
snapshot_download(repo_id=MODEL_NAME, local_dir=LOCAL_DIR)
print(f"Model downloaded to: {LOCAL_DIR}")
