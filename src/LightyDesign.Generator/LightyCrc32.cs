namespace LightyDesign.Generator;

using System.Text;

internal static class LightyCrc32
{
    private const uint Polynomial = 0xEDB88320u;
    private static readonly uint[] Table = BuildTable();

    private static uint[] BuildTable()
    {
        var table = new uint[256];
        for (uint i = 0; i < 256; i++)
        {
            var crc = i;
            for (var j = 0; j < 8; j++)
                crc = (crc & 1) != 0 ? (Polynomial ^ (crc >> 1)) : crc >> 1;
            table[i] = crc;
        }
        return table;
    }

    public static string Compute(string input)
    {
        var bytes = Encoding.UTF8.GetBytes(input ?? string.Empty);
        var crc = ~0u;
        foreach (var b in bytes)
            crc = Table[(crc ^ b) & 0xFF] ^ (crc >> 8);
        return (~crc).ToString("x8");
    }
}
