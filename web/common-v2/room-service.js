(function () {
  const C = window.LinkdNV2Client;

  window.LinkdNV2RoomService = {
    async listActiveRooms() {
      return C.select('rooms', q => q.eq('is_active', true).order('created_at', { ascending: true }));
    },
    async getRoom(roomId) {
      return C.maybeSingle('rooms', q => q.eq('id', roomId));
    },
    async listRoomMemberships(roomId = null) {
      return C.select('room_venues', q => {
        let next = q.is('left_at', null).order('joined_at', { ascending: true });
        if (roomId) next = next.eq('room_id', roomId);
        return next;
      });
    },
    async joinRoom({ roomId, venueId }) {
      return C.insert('room_venues', {
        room_id: roomId,
        venue_id: venueId,
        status: 'connected',
        is_broadcasting: false
      });
    },
    async leaveRoomByVenue(venueId) {
      return C.update('room_venues', {
        left_at: new Date().toISOString(),
        status: 'left',
        is_broadcasting: false
      }, { venue_id: venueId });
    }
  };
})();
