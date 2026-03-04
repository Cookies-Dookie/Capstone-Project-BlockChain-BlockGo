package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	pb "github.com/hyperledger/fabric-protos-go-apiv2/peer"
)

type AcademicRecord struct {
	ID          string `json:"id"`           
	StudentHash string `json:"student_hash"`
	Section     string `json:"section"`
	Course      string `json:"course"`       
	SubjectCode string `json:"subject_code"` 
	Grade       string `json:"grade"`
	Semester    string `json:"semester"`   
	SchoolYear  string `json:"school_year"`  
	FacultyID   string `json:"faculty_id"`  
	Date        string `json:"date"`      
	IpfsCID     string `json:"ipfs_cid"`
	University  string `json:"university"`
	Status      string `json:"status"`
	Version     int    `json:"version"`
}

type SmartContract struct{}

func (cc *SmartContract) Init(stub shim.ChaincodeStubInterface) *pb.Response {
	return shim.Success([]byte("OK"))
}

func (cc *SmartContract) Invoke(stub shim.ChaincodeStubInterface) *pb.Response {
	function, args := stub.GetFunctionAndParameters()
	switch function {
	case "IssueGrade":
		return cc.issueGrade(stub, args)
	case "ReadGrade":
		return cc.readGrade(stub, args)
	case "GetAllGrades":
		return cc.getAllGrades(stub)
	case "UpdateGrade":
		return cc.updateGrade(stub, args)
	default:
		return shim.Error(fmt.Sprintf("Unknown function: %s", function))
	}
}

func (cc *SmartContract) issueGrade(stub shim.ChaincodeStubInterface, args []string) *pb.Response {
	if len(args) < 1 {
		return shim.Error("Record data is required")
	}
	if err := cid.AssertAttributeValue(stub, "role", "faculty"); err != nil {
		return shim.Error(fmt.Sprintf("Role check failed: The user does not have the 'faculty' role required to issue grades. Error: %v", err))
	}

	var newRecord AcademicRecord
	if err := json.Unmarshal([]byte(args[0]), &newRecord); err != nil {
		return shim.Error(fmt.Sprintf("Invalid JSON input: %v", err))
	}

	existingJSON, err := stub.GetState(newRecord.ID)
	if err != nil {
		return shim.Error(fmt.Sprintf("Failed to read from world state: %v", err))
	}
	if existingJSON != nil {
		return shim.Error("Conflict: Record already exists.")
	}

	submitterID, err := cid.GetID(stub)
	if err != nil {
		return shim.Error(fmt.Sprintf("Failed to get submitter ID: %v", err))
	}
	newRecord.FacultyID = submitterID 
	newRecord.Version = 1
	newRecord.University = "PLV"
	newRecord.Status = "Verified"

	recordJSON, err := json.Marshal(newRecord)
	if err != nil {
		return shim.Error(fmt.Sprintf("Failed to marshal record: %v", err))
	}
	if err := stub.PutState(newRecord.ID, recordJSON); err != nil {
		return shim.Error(fmt.Sprintf("Failed to write to world state: %v", err))
	}

	return shim.Success([]byte(fmt.Sprintf(`{"status":"success","id":"%s"}`, newRecord.ID)))
}

func (cc *SmartContract) readGrade(stub shim.ChaincodeStubInterface, args []string) *pb.Response {
	if len(args) < 1 {
		return shim.Error("ID is required")
	}
	id := args[0]
	recordJSON, err := stub.GetState(id)
	if err != nil {
		return shim.Error(fmt.Sprintf("Failed to read from world state: %v", err))
	}
	if recordJSON == nil {
		return shim.Error("Record not found")
	}
	return shim.Success(recordJSON)
}

func (cc *SmartContract) updateGrade(stub shim.ChaincodeStubInterface, args []string) *pb.Response {
	if len(args) < 1 {
		return shim.Error("Updated record data is required")
	}

	if err := cid.AssertAttributeValue(stub, "role", "faculty"); err != nil {
		return shim.Error(fmt.Sprintf("Role check failed: The user does not have the 'faculty' role required to update grades. Error: %v", err))
	}

	var updatedRecord AcademicRecord
	if err := json.Unmarshal([]byte(args[0]), &updatedRecord); err != nil {
		return shim.Error(fmt.Sprintf("Invalid JSON input for update: %v", err))
	}

	existingJSON, err := stub.GetState(updatedRecord.ID)
	if err != nil {
		return shim.Error(fmt.Sprintf("Failed to read from world state: %v", err))
	}
	if existingJSON == nil {
		return shim.Error("Cannot update: Record does not exist.")
	}

	var existingRecord AcademicRecord
	if err := json.Unmarshal(existingJSON, &existingRecord); err != nil {
		return shim.Error(fmt.Sprintf("Failed to unmarshal existing record: %v", err))
	}
	submitterID, err := cid.GetID(stub)
	if err != nil {
		return shim.Error(fmt.Sprintf("Failed to get submitter ID: %v", err))
	}

	existingRecord.Grade = updatedRecord.Grade
	existingRecord.FacultyID = submitterID 
	existingRecord.Date = updatedRecord.Date
	existingRecord.Status = "Corrected" 
	existingRecord.Version++            

	recordJSON, err := json.Marshal(existingRecord)
	if err != nil {
		return shim.Error(fmt.Sprintf("Failed to marshal updated record: %v", err))
	}

	if err := stub.PutState(existingRecord.ID, recordJSON); err != nil {
		return shim.Error(fmt.Sprintf("Failed to write updated record to world state: %v", err))
	}

	return shim.Success([]byte(fmt.Sprintf(`{"status":"success","id":"%s"}`, existingRecord.ID)))
}

func (cc *SmartContract) getAllGrades(stub shim.ChaincodeStubInterface) *pb.Response {
	resultsIterator, err := stub.GetStateByRange("", "")
	if err != nil {
		return shim.Error(fmt.Sprintf("Failed to get world state: %v", err))
	}
	defer resultsIterator.Close()

	var records []AcademicRecord
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return shim.Error(fmt.Sprintf("Failed to iterate world state: %v", err))
		}

		var record AcademicRecord
		if err := json.Unmarshal(queryResponse.Value, &record); err != nil {
			log.Printf("Could not unmarshal world state data: %v", err)
			continue
		}
		records = append(records, record)
	}

	recordsJSON, err := json.Marshal(records)
	if err != nil {
		return shim.Error(fmt.Sprintf("Failed to marshal records: %v", err))
	}

	return shim.Success(recordsJSON)
}

func main() {
    tlsDisabled := os.Getenv("CHAINCODE_TLS_DISABLED") == "true"
    ccID := os.Getenv("CHAINCODE_ID")
    address := os.Getenv("CHAINCODE_SERVER_ADDRESS")

    log.Printf("[1] ID: %s | Address: %s | TLS Disabled: %t", ccID, address, tlsDisabled)

    server := &shim.ChaincodeServer{
        CCID:    ccID,
        Address: address,
        CC:      new(SmartContract),
    }

    if tlsDisabled {
        log.Printf("[2] FORCING PLAIN TEXT MODE (No TLS)")
        server.TLSProps = shim.TLSProperties{Disabled: true}
    } else {
        log.Printf("[2] ATTEMPTING SECURE MODE")
        server.TLSProps = shim.TLSProperties{
            Disabled: false,
            Key:      readFile(os.Getenv("CHAINCODE_TLS_KEY_FILE")),
            Cert:     readFile(os.Getenv("CHAINCODE_TLS_CERT_FILE")),
            ClientCACerts: readFile(os.Getenv("CHAINCODE_CLIENT_CA_CERT_FILE")),
        }
    }

    log.Printf("[3] INVOKING START...")
    if err := server.Start(); err != nil {
        log.Fatalf("Critical Error: %v", err)
    }
}

func readFile(path string) []byte {
	if path == "" {
		return nil
	}
	content, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("[ERROR] Could not read file at %s: %v", path, err)
	}
	return content
}