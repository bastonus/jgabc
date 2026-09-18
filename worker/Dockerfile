# worker/Dockerfile — Worker Oremus 100% autonome (Python 3.12 + CUDA 12.4 + ffmpeg)
#
# Construction :
#   docker build -t oremus-worker:latest ./worker
# Lancement (GPU NVIDIA) :
#   docker run --rm --gpus all -e WORKER_NAME="VotrePseudo" oremus-worker:latest
# Lancement (CPU + durée 60 min) :
#   docker run --rm -e WORKER_NAME="VotrePseudo" oremus-worker:latest --duration 60
#
# Prérequis hôte : Docker + pilote NVIDIA + nvidia-container-toolkit.

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OREMUS_SERVER=https://api-oremus.silverhorse.fr

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.12 python3.12-venv python3-pip ffmpeg libsndfile1 curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN python3.12 -m pip install --upgrade pip --break-system-packages \
 && python3.12 -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124/ --break-system-packages \
 && python3.12 -m pip install -r requirements.txt --break-system-packages

COPY worker.py docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
