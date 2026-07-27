export type CompanyOption = {
  id: number;
  nickname: string;
  name: string;
};

export type ProjectOption = {
  id: number;
  code: string | null;
  name: string;
  companyId: number;
  active: boolean;
};
