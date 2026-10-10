"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { parsePermissions, groupByModule, isAllowed, roles, roleDetails } from "@/core/authorization/matrix";

export function RolesPermissionMatrix() {
  const grouped = groupByModule(parsePermissions());

  return (
    <div className="space-y-8">
      {Object.entries(grouped).map(([module, perms]) => (
        <div key={module}>
          <h3 className="text-sm font-semibold capitalize mb-2">{module}</h3>
          <table className="w-full text-sm border">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2">Action</th>
                {roles.map((role) => (
                  <th key={role} className="p-2 text-center">
                    {roleDetails[role].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perms.map(({ key, action }) => (
                <tr key={key} className="border-b">
                  <td className="p-2 capitalize">{action}</td>
                  {roles.map((role) => (
                    <td key={role} className="p-2 text-center">
                      <Checkbox checked={isAllowed(role, key)} disabled />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}