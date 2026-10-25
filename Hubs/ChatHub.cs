using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace SignalR.Hubs;

public class ChatHub : Hub
{
    private sealed record UserInfo(string Name, string Room);
    private static readonly ConcurrentDictionary<string, UserInfo> Users = new();
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Locks = new();

    private const string Announcements = "announcements";
    private static readonly HashSet<string> ValidRooms =
        new(StringComparer.OrdinalIgnoreCase) { Announcements, "primary", "secondary" };

    public async Task RegisterUser(string user, string room)
    {
        if (Users.ContainsKey(Context.ConnectionId))
            throw new HubException("You are already registered.");

        var name = ValidateName(user);
        var roomName = ValidateRoom(room);

        Users[Context.ConnectionId] = new UserInfo(name, roomName);

        // Everyone is always in announcements (receiving channel).
        await Groups.AddToGroupAsync(Context.ConnectionId, Announcements);

        // Plus their home room, if it's not announcements.
        if (!string.Equals(roomName, Announcements, StringComparison.OrdinalIgnoreCase))
            await Groups.AddToGroupAsync(Context.ConnectionId, roomName);

        await Clients.OthersInGroup(roomName).SendAsync("UserJoined", name, roomName);
    }

    public async Task ChangeRoom(string room)
    {
        if (!Users.TryGetValue(Context.ConnectionId, out var info))
            throw new HubException("Register before changing rooms.");

        var roomName = ValidateRoom(room);
        if (string.Equals(roomName, info.Room, StringComparison.OrdinalIgnoreCase)) return;

        var gate = Locks.GetOrAdd(Context.ConnectionId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync();
        try
        {
            if (!Users.TryGetValue(Context.ConnectionId, out info)) return;

            var oldRoom = info.Room;
            Users[Context.ConnectionId] = info with { Room = roomName };

            // Leave old home room (never leave announcements).
            if (!string.Equals(oldRoom, Announcements, StringComparison.OrdinalIgnoreCase))
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, oldRoom);

            await SafeNotify(() => Clients.OthersInGroup(oldRoom)
                .SendAsync("UserLeft", info.Name, oldRoom));

            // Join new home room (announcements is already joined).
            if (!string.Equals(roomName, Announcements, StringComparison.OrdinalIgnoreCase))
                await Groups.AddToGroupAsync(Context.ConnectionId, roomName);

            await SafeNotify(() => Clients.OthersInGroup(roomName)
                .SendAsync("UserJoined", info.Name, roomName));

            await Clients.Caller.SendAsync("RoomChanged", roomName);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task SendMessage(string message)
    {
        if (!Users.TryGetValue(Context.ConnectionId, out var info))
            throw new HubException("You must register a username before sending messages.");

        var text = (message ?? string.Empty).Trim();
        if (text.Length == 0) return;

        // The room *is* the routing decision:
        //   announcements → everyone (everyone is in that group)
        //   primary/secondary → only that room's members
        await Clients.Group(info.Room).SendAsync("ReceiveMessage", info.Name, text, info.Room);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        try
        {
            if (Users.TryRemove(Context.ConnectionId, out var info))
            {
                await SafeNotify(() => Clients.OthersInGroup(info.Room)
                    .SendAsync("UserLeft", info.Name, info.Room));
            }
        }
        finally
        {
            if (Locks.TryRemove(Context.ConnectionId, out var gate))
                gate.Dispose();
            await base.OnDisconnectedAsync(exception);
        }
    }

    private async Task SafeNotify(Func<Task> send)
    {
        try { await send(); }
        catch (Exception ex) { Console.WriteLine($"[ChatHub] notify failed: {ex.Message}"); }
    }

    private static string ValidateName(string user)
    {
        var name = (user ?? string.Empty).Trim();
        if (name.Length == 0) throw new HubException("A username is required.");
        if (name.Length > 30) throw new HubException("Username must be 30 characters or fewer.");
        return name;
    }

    private static string ValidateRoom(string room)
    {
        var name = (room ?? string.Empty).Trim();
        if (name.Length == 0) return Announcements;
        if (!ValidRooms.Contains(name))
            throw new HubException($"Room must be one of: {string.Join(", ", ValidRooms)}");
        return name.ToLowerInvariant();
    }
}