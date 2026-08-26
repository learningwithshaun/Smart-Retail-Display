FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Set default environment variables
ENV GPIO_MODE=mock
ENV PYTHONUNBUFFERED=1

# Expose the port
EXPOSE 10000

# Start the application using uvicorn
# Render provides the PORT environment variable
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
