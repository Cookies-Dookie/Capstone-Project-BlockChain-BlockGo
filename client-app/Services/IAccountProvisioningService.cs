using Client_app.Models;

namespace Client_app.Services
{
    public interface IAccountProvisioningService
    {
        Task<ManagedAccountResult> CreateStaffAsync(StaffAccountRequest request, string actorEmail, string? ipAddress, CancellationToken cancellationToken);
        Task<IReadOnlyCollection<ManagedAccountResult>> GetRegistrarsAsync(CancellationToken cancellationToken);
        Task<ManagedAccountResult> CreateRegistrarAsync(RegistrarAccountRequest request, string actorEmail, string? ipAddress, CancellationToken cancellationToken);
        Task<ManagedAccountResult> UpdateRegistrarAsync(int userId, UpdateRegistrarAccountRequest request, string actorEmail, string? ipAddress, CancellationToken cancellationToken);
    }
}
