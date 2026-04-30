using System.Text.Json;
using LightyDesign.Application.Dtos;
using LightyDesign.Core;

namespace LightyDesign.Application.Services;

public sealed class SchemaQueryService
{
    public object GetHeaderProperties(string workspacePath)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        return new
        {
            properties = LightyHeaderPropertySchemaProvider.GetSchemas(workspace.HeaderLayout)
                .Select(WorkspaceResponseBuilder.ToHeaderPropertySchemaResponse),
        };
    }

    public object ValidateType(string type, string? workspacePath, string? workbookName)
    {
        LightyWorkspace? workspace = null;
        if (!string.IsNullOrWhiteSpace(workspacePath))
        {
            workspace = LightyWorkspaceLoader.Load(workspacePath);
        }

        var descriptor = LightySheetColumnValidator.ValidateType(type, workspace, workbookName);
        return new
        {
            ok = true,
            normalizedType = descriptor.RawType,
            descriptor.TypeName,
            descriptor.GenericArguments,
            descriptor.ValueType,
            descriptor.IsList,
            descriptor.IsDictionary,
            descriptor.IsReference,
            referenceTarget = descriptor.ReferenceTarget is null
                ? null
                : new
                {
                    descriptor.ReferenceTarget.WorkbookName,
                    descriptor.ReferenceTarget.SheetName,
                },
            descriptor = WorkspaceResponseBuilder.ToTypeDescriptorResponse(descriptor),
        };
    }

    public object GetTypeMetadata(string? workspacePath)
    {
        LightyWorkspace? workspace = null;
        if (!string.IsNullOrWhiteSpace(workspacePath))
        {
            workspace = LightyWorkspaceLoader.Load(workspacePath);
        }

        return WorkspaceResponseBuilder.ToTypeMetadataResponse(LightyTypeMetadataProvider.GetMetadata(workspace));
    }

    public object GetValidationSchema(string type, string? workspacePath)
    {
        if (!string.IsNullOrWhiteSpace(workspacePath))
        {
            _ = LightyWorkspaceLoader.Load(workspacePath);
        }

        var descriptor = LightyColumnTypeDescriptor.Parse(type);
        var schema = LightyValidationSchemaProvider.GetSchema(descriptor);
        return new
        {
            descriptor = WorkspaceResponseBuilder.ToTypeDescriptorResponse(descriptor),
            schema = WorkspaceResponseBuilder.ToValidationRuleSchemaResponse(schema),
        };
    }

    public void ValidateValidationRule(string type, JsonElement? validation, string workspacePath)
    {
        var workspace = LightyWorkspaceLoader.Load(workspacePath);
        LightyWorkbookValidationService.ValidateValidationRule(type, validation, workspace);
    }
}
