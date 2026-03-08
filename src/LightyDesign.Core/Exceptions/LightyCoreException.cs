namespace LightyDesign.Core;

public class LightyCoreException : Exception
{
    public LightyCoreException(string message)
        : base(message)
    {
    }

    public LightyCoreException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}