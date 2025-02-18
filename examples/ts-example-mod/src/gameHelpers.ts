export function getPlayer() {
  return gameInstance.state.store.player;
}

export function getElement(x: number, y: number) {
  const height = gameInstance.state.store.mapData.height;
  const width = gameInstance.state.store.mapData.width;
  const index = y * width + x;
  return gameInstance.state.store.mapData.data[index];
}
