using BlockGo.Models;
using System.Threading.Tasks;

namespace BlockGo.Services
{
    public interface IBlockchainService
    {
        Task<string> SubmitGradeAsync(GradeRequest request);
        Task<string> GetGradeAsync(string recordId);
        Task<string> GetAllGradesAsync();
    }
}