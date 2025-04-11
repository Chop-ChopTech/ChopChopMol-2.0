function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

function clearScene(scene) {
  // Create an array to store objects to remove
  const objectsToRemove = [];

  // Iterate through all scene children
  scene.traverse((object) => {
      // Skip cameras and lights
      if (!(object.isCamera || object.isLight)) {
          objectsToRemove.push(object);
      }
  });

  // Remove collected objects
  objectsToRemove.forEach((object) => {
      // Dispose of geometries and materials if they exist
      if (object.geometry) {
          object.geometry.dispose();
      }
      if (object.material) {
          if (Array.isArray(object.material)) {
              object.material.forEach(mat => mat.dispose());
          } else {
              object.material.dispose();
          }
      }
      // Remove object from scene
      scene.remove(object);
  });
}